package com.demo.rpcbridge

import android.util.Log
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import truapi.v02.*

private const val TAG = "TruApiServices"

// -- GeneralService --

class GeneralServiceImpl : GeneralService {
    override suspend fun featureSupported(request: FeatureSupportedRequest): FeatureSupportedResponse {
        Log.d(TAG, "featureSupported")
        return FeatureSupportedResponse(result = FeatureSupportedResponseResult.Supported(true))
    }

    override suspend fun navigateTo(request: NavigateToRequest): NavigateToResponse {
        Log.d(TAG, "navigateTo: ${request.url}")
        return NavigateToResponse(result = NavigateToResponseResult.Ok)
    }

    override suspend fun pushNotification(request: PushNotification): PushNotificationResponse {
        Log.d(TAG, "pushNotification: ${request.text}")
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
    override suspend fun deriveEntropy(request: DeriveEntropyRequest): DeriveEntropyResponse {
        Log.d(TAG, "deriveEntropy")
        return DeriveEntropyResponse(result = DeriveEntropyResponseResult.Entropy(ByteArray(32)))
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
    override fun balanceSubscribe(request: PaymentBalanceRequest): Flow<PaymentBalanceEvent> = flow {
        Log.d(TAG, "balanceSubscribe")
        emit(PaymentBalanceEvent(
            result = PaymentBalanceEventResult.Balance(
                PaymentBalance(available = "1000000000000", pending = "0")
            )
        ))
    }

    override suspend fun topUp(request: PaymentTopUpRequest): PaymentTopUpResponse {
        Log.d(TAG, "topUp: ${request.amount}")
        return PaymentTopUpResponse(result = PaymentTopUpResponseResult.Ok)
    }

    override suspend fun request(request: PaymentRequestMsg): PaymentRequestResponse {
        Log.d(TAG, "payment request: ${request.amount}")
        return PaymentRequestResponse(
            result = PaymentRequestResponseResult.Receipt(PaymentReceipt(id = "mock-receipt-1"))
        )
    }

    override fun statusSubscribe(request: PaymentStatusRequest): Flow<PaymentStatusEvent> = flow {
        Log.d(TAG, "statusSubscribe: ${request.paymentId}")
        emit(PaymentStatusEvent(
            result = PaymentStatusEventResult.Status(PaymentStatus())
        ))
    }
}

// -- PermissionsService --

class PermissionsServiceImpl : PermissionsService {
    override suspend fun devicePermissionRequest(request: DevicePermissionRequestMsg): DevicePermissionResponse {
        Log.d(TAG, "devicePermissionRequest: ${request.permission}")
        return DevicePermissionResponse(result = DevicePermissionResponseResult.Granted(true))
    }

    override suspend fun remotePermissionRequest(request: RemotePermissionRequestMsg): RemotePermissionResponse {
        Log.d(TAG, "remotePermissionRequest")
        return RemotePermissionResponse(result = RemotePermissionResponseResult.Granted(true))
    }
}

// -- PreimageService --

class PreimageServiceImpl : PreimageService {
    override fun lookupSubscribe(request: PreimageLookupRequest): Flow<PreimageLookupEvent> = flow {
        Log.d(TAG, "lookupSubscribe")
        emit(PreimageLookupEvent(value = ByteArray(32)))
    }
}

// -- SigningService --

class SigningServiceImpl : SigningService {
    override suspend fun signPayload(request: SigningPayload): SignPayloadResponse {
        Log.d(TAG, "signPayload")
        return SignPayloadResponse(
            result = SignPayloadResponseResult.Ok(
                SigningResult(signature = ByteArray(64), signedTransaction = ByteArray(0))
            )
        )
    }

    override suspend fun signRaw(request: SigningRawPayload): SignRawResponse {
        Log.d(TAG, "signRaw")
        return SignRawResponse(
            result = SignRawResponseResult.Ok(
                SigningResult(signature = ByteArray(64), signedTransaction = ByteArray(0))
            )
        )
    }

    override suspend fun createTransaction(request: CreateTransactionRequest): CreateTransactionResponse {
        Log.d(TAG, "createTransaction")
        return CreateTransactionResponse(result = CreateTransactionResponseResult.Transaction(ByteArray(128)))
    }

    override suspend fun createTransactionNonProduct(request: CreateTransactionNonProductRequest): CreateTransactionResponse {
        Log.d(TAG, "createTransactionNonProduct")
        return CreateTransactionResponse(result = CreateTransactionResponseResult.Transaction(ByteArray(128)))
    }
}

// -- StatementStoreService --

class StatementStoreServiceImpl : StatementStoreService {
    override fun subscribe(request: TopicFilter): Flow<StatementList> = flow {
        Log.d(TAG, "statement subscribe")
        emit(StatementList())
    }

    override suspend fun createProof(request: StatementCreateProofRequest): StatementCreateProofResponse {
        Log.d(TAG, "statement createProof")
        return StatementCreateProofResponse(
            result = StatementCreateProofResponseResult.Error(
                StatementProofError(reason = "Not implemented")
            )
        )
    }

    override suspend fun submit(request: StatementSubmitRequest): StatementSubmitResponse {
        Log.d(TAG, "statement submit")
        return StatementSubmitResponse(result = StatementSubmitResponseResult.Hash("0xmockhash"))
    }
}
