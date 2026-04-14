package com.demo.rpcbridge

import android.util.Log
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import truapi.v02.*
import java.security.MessageDigest

private const val TAG = "TruApiServices"

// -- GeneralService --

class GeneralServiceImpl(
    private val onNavigate: (String) -> Unit = {},
    private val onNotification: (String, String) -> Unit = { _, _ -> },
) : GeneralService {
    override suspend fun featureSupported(request: FeatureSupportedRequest): FeatureSupportedResponse {
        // Chain features are always supported in the playground.
        val supported = request.feature.feature is FeatureFeature.Chain
        Log.d(TAG, "featureSupported: $supported")
        return FeatureSupportedResponse(result = FeatureSupportedResponseResult.Supported(supported))
    }

    override suspend fun navigateTo(request: NavigateToRequest): NavigateToResponse {
        if (request.url.isEmpty()) {
            Log.w(TAG, "navigateTo: empty URL")
            return NavigateToResponse(
                result = NavigateToResponseResult.Error(
                    NavigateToError(code = NavigateToErrorCode.NAVIGATE_TO_ERROR_CODE_UNKNOWN, reason = "Empty URL")
                )
            )
        }
        Log.d(TAG, "navigateTo: ${request.url}")
        onNavigate(request.url)
        return NavigateToResponse(result = NavigateToResponseResult.Ok)
    }

    override suspend fun pushNotification(request: PushNotification): PushNotificationResponse {
        Log.d(TAG, "pushNotification: ${request.text} ${request.deeplink}")
        onNotification(request.text, request.deeplink)
        return PushNotificationResponse(result = PushNotificationResponseResult.Ok)
    }
}

// -- AccountService --

class AccountServiceImpl : AccountService {

    // Mock root public key (deterministic).
    private val mockRootKey = ByteArray(32).also { it[0] = 0xAA.toByte(); it[1] = 0xBB.toByte() }

    // Derive a deterministic mock public key from dotNsIdentifier and derivationIndex.
    private fun deriveProductKey(dotNsIdentifier: String, derivationIndex: Int): ByteArray {
        val key = ByteArray(32)
        for (i in 0 until minOf(dotNsIdentifier.length, 30)) {
            key[i] = dotNsIdentifier[i].code.toByte()
        }
        key[30] = ((derivationIndex shr 8) and 0xff).toByte()
        key[31] = (derivationIndex and 0xff).toByte()
        return key
    }

    override suspend fun getAccount(request: GetAccountRequest): GetAccountResponse {
        Log.d(TAG, "getAccount: ${request.account.dotNsIdentifier} index ${request.account.derivationIndex}")
        val publicKey = deriveProductKey(request.account.dotNsIdentifier, request.account.derivationIndex.toInt())
        return GetAccountResponse(
            result = GetAccountResponseResult.Account(Account(publicKey = publicKey, name = "Alice"))
        )
    }

    override suspend fun getAlias(request: GetAliasRequest): GetAliasResponse {
        // Ring VRF alias not yet implemented
        Log.d(TAG, "getAlias: not implemented")
        return GetAliasResponse(
            result = GetAliasResponseResult.Error(
                RequestCredentialsError(
                    code = RequestCredentialsErrorCode.REQUEST_CREDENTIALS_ERROR_CODE_UNKNOWN,
                    reason = "Ring VRF alias not yet implemented"
                )
            )
        )
    }

    override suspend fun createProof(request: CreateProofRequest): CreateProofResponse {
        // Ring VRF proof not yet implemented
        Log.d(TAG, "createProof: not implemented")
        return CreateProofResponse(
            result = CreateProofResponseResult.Error(
                CreateProofError(
                    code = CreateProofErrorCode.CREATE_PROOF_ERROR_CODE_UNKNOWN,
                    reason = "Ring VRF proof not yet implemented"
                )
            )
        )
    }

    override suspend fun getNonProductAccounts(request: GetNonProductAccountsRequest): GetNonProductAccountsResponse {
        Log.d(TAG, "getNonProductAccounts")
        return GetNonProductAccountsResponse(
            result = GetNonProductAccountsResponseResult.Accounts(
                AccountList(accounts = listOf(Account(publicKey = mockRootKey, name = "Alice")))
            )
        )
    }

    override fun connectionStatusSubscribe(request: ConnectionStatusRequest): Flow<AccountConnectionStatusEvent> = flow {
        // Playground is always authenticated
        Log.d(TAG, "connectionStatusSubscribe")
        emit(AccountConnectionStatusEvent(status = AccountConnectionStatus.ACCOUNT_CONNECTION_STATUS_CONNECTED))
    }

    override suspend fun getUserId(request: GetUserIdRequest): GetUserIdResponse {
        Log.d(TAG, "getUserId")
        return GetUserIdResponse(
            result = GetUserIdResponseResult.Identity(
                UserIdentity(dotNsIdentifier = "alice.dot", publicKey = mockRootKey)
            )
        )
    }
}

// -- ChainService --

class ChainServiceImpl : ChainService {

    // Polkadot genesis hash
    private val polkadotGenesis = hexToBytes(
        "91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"
    )

    private var opCounter = java.util.concurrent.atomic.AtomicInteger(0)
    private fun nextOpId(): String = "op-${opCounter.incrementAndGet()}"

    private fun polkadotRuntime(): RuntimeType = RuntimeType(
        runtime = RuntimeTypeRuntime.Valid(
            RuntimeSpec(
                specName = "polkadot",
                implName = "parity-polkadot",
                specVersion = 1_003_004u,
                implVersion = 0u,
                transactionVersion = 26u,
                apis = listOf(
                    RuntimeApi(name = "Core", version = 5u),
                    RuntimeApi(name = "Metadata", version = 2u),
                    RuntimeApi(name = "BlockBuilder", version = 6u),
                    RuntimeApi(name = "TaggedTransactionQueue", version = 3u),
                    RuntimeApi(name = "AccountNonceApi", version = 1u),
                    RuntimeApi(name = "TransactionPaymentApi", version = 4u),
                )
            )
        )
    )

    override fun headFollow(request: ChainHeadFollowRequest): Flow<ChainHeadEvent> = flow {
        Log.d(TAG, "headFollow")
        val finalizedHash = randomHash()

        // Initialized event
        emit(ChainHeadEvent(event = ChainHeadEventEvent.Initialized(
            Initialized(
                finalizedBlockHashes = listOf(finalizedHash),
                finalizedBlockRuntime = polkadotRuntime()
            )
        )))

        // Simulate 5 new blocks arriving every ~2s
        var parentHash = finalizedHash
        val pendingHashes = mutableListOf<ByteArray>()

        for (i in 0 until 5) {
            kotlinx.coroutines.delay(2000)

            val blockHash = randomHash()
            pendingHashes.add(blockHash)

            emit(ChainHeadEvent(event = ChainHeadEventEvent.NewBlock(
                NewBlock(blockHash = blockHash, parentBlockHash = parentHash)
            )))

            emit(ChainHeadEvent(event = ChainHeadEventEvent.BestBlockChanged(
                BestBlockChanged(bestBlockHash = blockHash)
            )))

            // Finalize every 2 blocks
            if (pendingHashes.size >= 2) {
                emit(ChainHeadEvent(event = ChainHeadEventEvent.Finalized(
                    Finalized(finalizedBlockHashes = pendingHashes.toList())
                )))
                pendingHashes.clear()
            }

            parentHash = blockHash
        }

        // Finalize remaining
        if (pendingHashes.isNotEmpty()) {
            emit(ChainHeadEvent(event = ChainHeadEventEvent.Finalized(
                Finalized(finalizedBlockHashes = pendingHashes.toList())
            )))
        }
    }

    override suspend fun headHeader(request: ChainHeadBlockRequest): ChainHeadHeaderResponse {
        Log.d(TAG, "headHeader")
        return ChainHeadHeaderResponse(
            result = ChainHeadHeaderResponseResult.Value(ChainHeadHeaderValue(header = randomHash() + randomHash() + ByteArray(16)))
        )
    }

    override suspend fun headBody(request: ChainHeadBlockRequest): OperationStartedResponse {
        Log.d(TAG, "headBody")
        return OperationStartedResponse(
            result = OperationStartedResponseResult.Value(
                OperationStartedResult(result = OperationStartedResultResult.OperationId(nextOpId()))
            )
        )
    }

    override suspend fun headStorage(request: ChainHeadStorageRequest): OperationStartedResponse {
        Log.d(TAG, "headStorage")
        return OperationStartedResponse(
            result = OperationStartedResponseResult.Value(
                OperationStartedResult(result = OperationStartedResultResult.OperationId(nextOpId()))
            )
        )
    }

    override suspend fun headCall(request: ChainHeadCallRequest): OperationStartedResponse {
        Log.d(TAG, "headCall")
        return OperationStartedResponse(
            result = OperationStartedResponseResult.Value(
                OperationStartedResult(result = OperationStartedResultResult.OperationId(nextOpId()))
            )
        )
    }

    override suspend fun headUnpin(request: ChainHeadUnpinRequest): ChainVoidResponse {
        Log.d(TAG, "headUnpin")
        return ChainVoidResponse(result = ChainVoidResponseResult.Ok)
    }

    override suspend fun headContinue(request: ChainHeadOperationRequest): ChainVoidResponse {
        Log.d(TAG, "headContinue")
        return ChainVoidResponse(result = ChainVoidResponseResult.Ok)
    }

    override suspend fun headStopOperation(request: ChainHeadOperationRequest): ChainVoidResponse {
        Log.d(TAG, "headStopOperation")
        return ChainVoidResponse(result = ChainVoidResponseResult.Ok)
    }

    override suspend fun specGenesisHash(request: ChainGenesisRequest): ChainBytesResponse {
        Log.d(TAG, "specGenesisHash")
        return ChainBytesResponse(result = ChainBytesResponseResult.Value(polkadotGenesis))
    }

    override suspend fun specChainName(request: ChainGenesisRequest): ChainStringResponse {
        Log.d(TAG, "specChainName")
        return ChainStringResponse(result = ChainStringResponseResult.Value("Polkadot"))
    }

    override suspend fun specProperties(request: ChainGenesisRequest): ChainStringResponse {
        Log.d(TAG, "specProperties")
        return ChainStringResponse(
            result = ChainStringResponseResult.Value("{\"ss58Format\":0,\"tokenDecimals\":10,\"tokenSymbol\":\"DOT\"}")
        )
    }

    override suspend fun transactionBroadcast(request: ChainTransactionBroadcastRequest): ChainTransactionBroadcastResponse {
        Log.d(TAG, "transactionBroadcast")
        return ChainTransactionBroadcastResponse(
            result = ChainTransactionBroadcastResponseResult.Value(
                ChainTransactionBroadcastValue(operationId = nextOpId())
            )
        )
    }

    override suspend fun transactionStop(request: ChainTransactionStopRequest): ChainVoidResponse {
        Log.d(TAG, "transactionStop")
        return ChainVoidResponse(result = ChainVoidResponseResult.Ok)
    }

    companion object {
        private fun hexToBytes(hex: String): ByteArray {
            return ByteArray(hex.length / 2) { i ->
                hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            }
        }

        private fun randomHash(): ByteArray = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
    }
}

// -- ChatService --

class ChatServiceImpl : ChatService {
    private val rooms = mutableMapOf<String, ChatRoom>()
    private val botIds = mutableSetOf<String>()
    private var msgSeq = 0
    private val listFlow = kotlinx.coroutines.flow.MutableSharedFlow<ChatRoomList>(replay = 0)

    private fun currentRoomList() = ChatRoomList(rooms = rooms.values.toList())

    override suspend fun createRoom(request: ChatRoomRequest): ChatRoomResponse {
        Log.d(TAG, "createRoom: ${request.roomId}")
        if (rooms.containsKey(request.roomId)) {
            return ChatRoomResponse(
                result = ChatRoomResponseResult.Ok(
                    ChatRoomRegistrationResult(status = ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_EXISTS)
                )
            )
        }
        rooms[request.roomId] = ChatRoom(
            roomId = request.roomId,
            participatingAs = ChatRoomParticipation.CHAT_ROOM_PARTICIPATION_ROOM_HOST
        )
        listFlow.emit(currentRoomList())
        return ChatRoomResponse(
            result = ChatRoomResponseResult.Ok(
                ChatRoomRegistrationResult(status = ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_NEW)
            )
        )
    }

    override suspend fun createSimpleGroup(request: SimpleGroupChatRequest): SimpleGroupChatResponse {
        Log.d(TAG, "createSimpleGroup: ${request.roomId}")
        val exists = rooms.containsKey(request.roomId)
        if (!exists) {
            rooms[request.roomId] = ChatRoom(
                roomId = request.roomId,
                participatingAs = ChatRoomParticipation.CHAT_ROOM_PARTICIPATION_ROOM_HOST
            )
            listFlow.emit(currentRoomList())
        }
        return SimpleGroupChatResponse(
            result = SimpleGroupChatResponseResult.Ok(
                SimpleGroupChatResult(
                    status = if (exists) ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_EXISTS
                             else ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_NEW,
                    joinLink = "https://mock.link/join/${request.roomId}"
                )
            )
        )
    }

    override suspend fun registerBot(request: ChatBotRequest): ChatBotResponse {
        Log.d(TAG, "registerBot: ${request.botId}")
        if (!botIds.add(request.botId)) {
            return ChatBotResponse(
                result = ChatBotResponseResult.Ok(
                    ChatBotRegistrationResult(status = ChatBotRegistrationStatus.CHAT_BOT_REGISTRATION_STATUS_EXISTS)
                )
            )
        }
        return ChatBotResponse(
            result = ChatBotResponseResult.Ok(
                ChatBotRegistrationResult(status = ChatBotRegistrationStatus.CHAT_BOT_REGISTRATION_STATUS_NEW)
            )
        )
    }

    override suspend fun postMessage(request: ChatPostMessageRequest): ChatPostMessageResponse {
        val messageId = "msg-${++msgSeq}"
        Log.d(TAG, "postMessage: ${request.roomId} -> $messageId")
        return ChatPostMessageResponse(
            result = ChatPostMessageResponseResult.Ok(ChatPostMessageResult(messageId = messageId))
        )
    }

    override fun listSubscribe(request: ChatListRequest): Flow<ChatRoomList> = flow {
        Log.d(TAG, "listSubscribe")
        // Emit current snapshot then forward updates.
        emit(currentRoomList())
        listFlow.collect { emit(it) }
    }

    override fun actionSubscribe(request: ChatActionRequest): Flow<ReceivedChatAction> = flow {
        Log.d(TAG, "actionSubscribe")
        // No real chat peers in the playground, so nothing to emit.
    }

    override fun customRenderSubscribe(requests: Flow<CustomRendererNode>): Flow<CustomMessageRenderRequest> = flow {
        Log.d(TAG, "customRenderSubscribe")
        // No custom message types in the playground. Consume the stream without emitting.
        requests.collect { }
    }
}

// -- EntropyService --

class EntropyServiceImpl : EntropyService {

    companion object {
        // Fixed 32-byte mock root seed simulating BIP-39 root entropy.
        private val MOCK_ROOT_SEED = byteArrayOf(
            0x4d, 0x6f, 0x63, 0x6b, 0x52, 0x6f, 0x6f, 0x74,
            0x53, 0x65, 0x65, 0x64, 0x5f, 0x30, 0x31, 0x32,
            0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x61,
            0x62, 0x63, 0x64, 0x65, 0x66, 0x30, 0x31, 0x32,
        )
    }

    override suspend fun deriveEntropy(request: DeriveEntropyRequest): DeriveEntropyResponse {
        Log.d(TAG, "deriveEntropy key=${request.key.size} bytes")
        // Deterministic derivation: SHA-256(rootSeed || key) as a stand-in for
        // the real three-layer BLAKE2b-256 keyed hashing scheme.
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(MOCK_ROOT_SEED)
        digest.update(request.key)
        val entropy = digest.digest()
        return DeriveEntropyResponse(result = DeriveEntropyResponseResult.Entropy(entropy))
    }
}

// -- LocalStorageService --

class LocalStorageServiceImpl : LocalStorageService {
    private val prefix = "truapi:"
    private val store = mutableMapOf<String, ByteArray>()

    override suspend fun read(request: StorageReadRequest): StorageReadResponse {
        val key = prefix + request.key
        Log.d(TAG, "storage read: $key")
        return StorageReadResponse(
            result = StorageReadResponseResult.Value(StorageReadValue(data = store[key]))
        )
    }

    override suspend fun write(request: StorageWriteRequest): StorageWriteResponse {
        val key = prefix + request.key
        Log.d(TAG, "storage write: $key")
        store[key] = request.value
        return StorageWriteResponse(result = StorageWriteResponseResult.Ok)
    }

    override suspend fun clear(request: StorageClearRequest): StorageClearResponse {
        val key = prefix + request.key
        Log.d(TAG, "storage clear: $key")
        store.remove(key)
        return StorageClearResponse(result = StorageClearResponseResult.Ok)
    }
}

// -- PaymentService --

class PaymentServiceImpl : PaymentService {
    private var paymentCounter = 0

    override fun balanceSubscribe(request: PaymentBalanceRequest): Flow<PaymentBalanceEvent> = flow {
        Log.d(TAG, "balanceSubscribe")
        emit(PaymentBalanceEvent(
            result = PaymentBalanceEventResult.Balance(
                PaymentBalance(available = "1000000000000", pending = "0")
            )
        ))
        // Keep stream open (production pushes updates as balance changes).
        kotlinx.coroutines.awaitCancellation()
    }

    override suspend fun topUp(request: PaymentTopUpRequest): PaymentTopUpResponse {
        Log.d(TAG, "topUp: ${request.amount}")
        return PaymentTopUpResponse(result = PaymentTopUpResponseResult.Ok)
    }

    override suspend fun request(request: PaymentRequestMsg): PaymentRequestResponse {
        Log.d(TAG, "payment request: ${request.amount}")
        paymentCounter++
        return PaymentRequestResponse(
            result = PaymentRequestResponseResult.Receipt(PaymentReceipt(id = "pay-$paymentCounter"))
        )
    }

    override fun statusSubscribe(request: PaymentStatusRequest): Flow<PaymentStatusEvent> = flow {
        Log.d(TAG, "statusSubscribe: ${request.paymentId}")
        emit(PaymentStatusEvent(
            result = PaymentStatusEventResult.Status(
                PaymentStatus(status = PaymentStatusStatus.Processing)
            )
        ))
        // Keep stream open (production pushes updates as payment progresses).
        kotlinx.coroutines.awaitCancellation()
    }
}

// -- PermissionsService --

class PermissionsServiceImpl : PermissionsService {

    // Tracks granted device permissions for the session.
    private val grantedPermissions = mutableSetOf<DevicePermission>()

    // Permissions that the mock host always denies.
    private val deniedDevicePermissions = setOf(DevicePermission.DEVICE_PERMISSION_BIOMETRICS)

    override suspend fun devicePermissionRequest(request: DevicePermissionRequestMsg): DevicePermissionResponse {
        val perm = request.permission
        Log.d(TAG, "devicePermissionRequest: $perm")

        if (perm == DevicePermission.DEVICE_PERMISSION_UNSPECIFIED) {
            return DevicePermissionResponse(
                result = DevicePermissionResponseResult.Error(GenericError(reason = "Permission type is required"))
            )
        }

        if (perm in deniedDevicePermissions) {
            return DevicePermissionResponse(result = DevicePermissionResponseResult.Granted(false))
        }

        grantedPermissions.add(perm)
        return DevicePermissionResponse(result = DevicePermissionResponseResult.Granted(true))
    }

    override suspend fun remotePermissionRequest(request: RemotePermissionRequestMsg): RemotePermissionResponse {
        val perms = request.permissions
        Log.d(TAG, "remotePermissionRequest: ${perms.size} permission(s)")

        if (perms.isEmpty()) {
            return RemotePermissionResponse(
                result = RemotePermissionResponseResult.Error(GenericError(reason = "At least one permission is required"))
            )
        }

        for (entry in perms) {
            when (val p = entry.permission) {
                is RemotePermissionPermission.Remote -> {
                    val domains = p.value.domains
                    if (domains.any { it == "*" }) {
                        Log.d(TAG, "denied: wildcard (*) remote domain")
                        return RemotePermissionResponse(result = RemotePermissionResponseResult.Granted(false))
                    }
                    Log.d(TAG, "granted remote domains: ${domains.joinToString(", ")}")
                }
                is RemotePermissionPermission.WebRtc ->
                    Log.d(TAG, "granted webRtc")
                is RemotePermissionPermission.ChainSubmit ->
                    Log.d(TAG, "granted chainSubmit")
                is RemotePermissionPermission.StatementSubmit ->
                    Log.d(TAG, "granted statementSubmit")
                is RemotePermissionPermission.Unknown ->
                    Log.d(TAG, "unknown remote permission, ignoring")
            }
        }

        return RemotePermissionResponse(result = RemotePermissionResponseResult.Granted(true))
    }
}

// -- PreimageService --

class PreimageServiceImpl : PreimageService {
    private val cache = mutableMapOf<String, ByteArray>()

    private fun toHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    private fun deriveMockPreimage(key: ByteArray): ByteArray {
        val keySize = key.size.coerceAtLeast(1)
        return ByteArray(32) { i -> ((key.getOrElse(i % keySize) { 0 }).toInt() xor 0xff).toByte() }
    }

    override fun lookupSubscribe(request: PreimageLookupRequest): Flow<PreimageLookupEvent> = flow {
        val keyHex = toHex(request.key)
        Log.d(TAG, "lookupSubscribe key=0x$keyHex")

        val cached = cache[keyHex]
        if (cached != null) {
            Log.d(TAG, "preimage cache hit for key=0x$keyHex")
            emit(PreimageLookupEvent(value = cached))
            return@flow
        }

        // Not cached: emit empty value (preimage pending)
        emit(PreimageLookupEvent(value = ByteArray(0)))

        // Simulate IPFS fetch delay
        kotlinx.coroutines.delay(2000)

        // Resolve, cache, and emit
        val resolved = deriveMockPreimage(request.key)
        cache[keyHex] = resolved
        Log.d(TAG, "preimage resolved for key=0x$keyHex")
        emit(PreimageLookupEvent(value = resolved))
    }
}

// -- SigningService --

class SigningServiceImpl : SigningService {
    private val mockSignature = ByteArray(64)
    private val mockTransaction = ByteArray(128)

    override suspend fun signPayload(request: SigningPayload): SignPayloadResponse {
        Log.d(TAG, "signPayload: account=${request.account.dotNsIdentifier}/${request.account.derivationIndex}")

        return SignPayloadResponse(
            result = SignPayloadResponseResult.Ok(
                SigningResult(
                    signature = mockSignature,
                    signedTransaction = if (request.withSignedTransaction) mockTransaction else ByteArray(0)
                )
            )
        )
    }

    override suspend fun signRaw(request: SigningRawPayload): SignRawResponse {
        Log.d(TAG, "signRaw: account=${request.account.dotNsIdentifier}/${request.account.derivationIndex}")

        return SignRawResponse(
            result = SignRawResponseResult.Ok(
                SigningResult(signature = mockSignature, signedTransaction = ByteArray(0))
            )
        )
    }

    override suspend fun createTransaction(request: CreateTransactionRequest): CreateTransactionResponse {
        Log.d(TAG, "createTransaction: account=${request.account.dotNsIdentifier}/${request.account.derivationIndex}")
        return CreateTransactionResponse(
            result = CreateTransactionResponseResult.Transaction(mockTransaction)
        )
    }

    override suspend fun createTransactionNonProduct(request: CreateTransactionNonProductRequest): CreateTransactionResponse {
        Log.d(TAG, "createTransactionNonProduct")
        return CreateTransactionResponse(
            result = CreateTransactionResponseResult.Transaction(mockTransaction)
        )
    }
}

// -- StatementStoreService --

class StatementStoreServiceImpl : StatementStoreService {

    companion object {
        private val mockSigner = ByteArray(32).also { it[0] = 0xd4.toByte(); it[1] = 0x35 }
        private val mockSigner2 = ByteArray(32).also { it[0] = 0x8e.toByte(); it[1] = 0xaf.toByte() }
        private val mockTopicA = ByteArray(32).also { it[0] = 0x01 }
        private val mockTopicB = ByteArray(32).also { it[0] = 0x02 }
        private fun mockSignature(len: Int) = ByteArray(len) { i -> ((i * 7 + 0xab) and 0xff).toByte() }
        private val submitCounter = AtomicInteger(0)

        /** Check if a statement matches the positional topic filter. */
        private fun matchesFilter(statement: SignedStatement, filter: TopicFilter): Boolean {
            for ((i, entry) in filter.topics.withIndex()) {
                if (entry.topic.isEmpty()) continue // wildcard
                val sTopic = statement.topics.getOrNull(i) ?: return false
                if (!sTopic.contentEquals(entry.topic)) return false
            }
            return true
        }

        private fun makeSignedStatements(filter: TopicFilter): List<SignedStatement> {
            val now = System.currentTimeMillis() / 1000

            val stmt1 = SignedStatement(
                proof = StatementProof(proof = StatementProofProof.Sr25519(
                    Sr25519Proof(signature = mockSignature(64), signer = mockSigner)
                )),
                expiry = (now + 3600).toULong(),
                topics = listOf(mockTopicA),
                data = """{"type":"profile","name":"Alice"}""".toByteArray()
            )

            val stmt2 = SignedStatement(
                proof = StatementProof(proof = StatementProofProof.Ed25519(
                    Ed25519Proof(signature = mockSignature(64), signer = mockSigner2)
                )),
                decryptionKey = ByteArray(32),
                expiry = (now + 7200).toULong(),
                topics = listOf(mockTopicA, mockTopicB),
                data = """{"type":"attestation","score":42}""".toByteArray()
            )

            val statements = listOf(stmt1, stmt2)
            if (filter.topics.isEmpty()) return statements
            return statements.filter { matchesFilter(it, filter) }
        }
    }

    override fun subscribe(request: TopicFilter): Flow<StatementList> = flow {
        Log.d(TAG, "statement subscribe")
        emit(StatementList(statements = makeSignedStatements(request)))

        // Simulate a delayed update
        kotlinx.coroutines.delay(1500)
        val nowUpdated = System.currentTimeMillis() / 1000
        val stmt3 = SignedStatement(
            proof = StatementProof(proof = StatementProofProof.Sr25519(
                Sr25519Proof(signature = mockSignature(64), signer = mockSigner)
            )),
            expiry = (nowUpdated + 1800).toULong(),
            topics = listOf(mockTopicB),
            data = """{"type":"update","seq":1}""".toByteArray()
        )
        val filtered = if (request.topics.isEmpty()) listOf(stmt3)
            else listOf(stmt3).filter { matchesFilter(it, request) }
        if (filtered.isNotEmpty()) {
            emit(StatementList(statements = filtered))
        }
    }

    override suspend fun createProof(request: StatementCreateProofRequest): StatementCreateProofResponse {
        Log.d(TAG, "statement createProof")
        return StatementCreateProofResponse(
            result = StatementCreateProofResponseResult.Proof(
                StatementProof(proof = StatementProofProof.Sr25519(
                    Sr25519Proof(signature = mockSignature(64), signer = mockSigner)
                ))
            )
        )
    }

    override suspend fun submit(request: StatementSubmitRequest): StatementSubmitResponse {
        Log.d(TAG, "statement submit")
        val count = submitCounter.incrementAndGet()
        val hash = "0x" + mockSignature(32).joinToString("") { "%02x".format(it) }
        return StatementSubmitResponse(
            result = StatementSubmitResponseResult.Hash("$hash-$count")
        )
    }
}
