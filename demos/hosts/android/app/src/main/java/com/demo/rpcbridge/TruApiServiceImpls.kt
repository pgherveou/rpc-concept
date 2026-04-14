package com.demo.rpcbridge

import android.util.Log
import java.util.concurrent.atomic.AtomicInteger
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
    override suspend fun getAccount(request: GetAccountRequest): GetAccountResponse {
        Log.d(TAG, "getAccount")
        return GetAccountResponse(
            result = GetAccountResponseResult.Account(Account(publicKey = ByteArray(32), name = "Alice"))
        )
    }

    override suspend fun getAlias(request: GetAliasRequest): GetAliasResponse {
        Log.d(TAG, "getAlias")
        return GetAliasResponse(
            result = GetAliasResponseResult.Alias(ContextualAlias(context = ByteArray(0), alias = ByteArray(0)))
        )
    }

    override suspend fun createProof(request: CreateProofRequest): CreateProofResponse {
        Log.d(TAG, "createProof")
        return CreateProofResponse(result = CreateProofResponseResult.Proof(ByteArray(64)))
    }

    override suspend fun getNonProductAccounts(request: GetNonProductAccountsRequest): GetNonProductAccountsResponse {
        Log.d(TAG, "getNonProductAccounts")
        return GetNonProductAccountsResponse(
            result = GetNonProductAccountsResponseResult.Accounts(
                AccountList(accounts = listOf(Account(publicKey = ByteArray(32), name = "Bob")))
            )
        )
    }

    override fun connectionStatusSubscribe(request: ConnectionStatusRequest): Flow<AccountConnectionStatusEvent> = flow {
        Log.d(TAG, "connectionStatusSubscribe")
        emit(AccountConnectionStatusEvent(status = AccountConnectionStatus.ACCOUNT_CONNECTION_STATUS_CONNECTED))
    }

    override suspend fun getUserId(request: GetUserIdRequest): GetUserIdResponse {
        Log.d(TAG, "getUserId")
        return GetUserIdResponse(
            result = GetUserIdResponseResult.Identity(
                UserIdentity(dotNsIdentifier = "mock-user", publicKey = ByteArray(32))
            )
        )
    }
}

// -- ChainService --

class ChainServiceImpl : ChainService {
    override fun headFollow(request: ChainHeadFollowRequest): Flow<ChainHeadEvent> = flow {
        Log.d(TAG, "headFollow")
        emit(ChainHeadEvent(event = ChainHeadEventEvent.Initialized(
            Initialized(finalizedBlockHashes = listOf(ByteArray(32)), finalizedBlockRuntime = RuntimeType())
        )))
        emit(ChainHeadEvent(event = ChainHeadEventEvent.NewBlock(
            NewBlock(blockHash = ByteArray(32), parentBlockHash = ByteArray(32), newRuntime = RuntimeType())
        )))
        emit(ChainHeadEvent(event = ChainHeadEventEvent.BestBlockChanged(
            BestBlockChanged(bestBlockHash = ByteArray(32))
        )))
    }

    override suspend fun headHeader(request: ChainHeadBlockRequest): ChainHeadHeaderResponse {
        Log.d(TAG, "headHeader")
        return ChainHeadHeaderResponse(
            result = ChainHeadHeaderResponseResult.Value(ChainHeadHeaderValue(header = ByteArray(80)))
        )
    }

    override suspend fun headBody(request: ChainHeadBlockRequest): OperationStartedResponse {
        Log.d(TAG, "headBody")
        return OperationStartedResponse(
            result = OperationStartedResponseResult.Value(
                OperationStartedResult(result = OperationStartedResultResult.OperationId("op-1"))
            )
        )
    }

    override suspend fun headStorage(request: ChainHeadStorageRequest): OperationStartedResponse {
        Log.d(TAG, "headStorage")
        return OperationStartedResponse(
            result = OperationStartedResponseResult.Value(
                OperationStartedResult(result = OperationStartedResultResult.OperationId("op-2"))
            )
        )
    }

    override suspend fun headCall(request: ChainHeadCallRequest): OperationStartedResponse {
        Log.d(TAG, "headCall")
        return OperationStartedResponse(
            result = OperationStartedResponseResult.Value(
                OperationStartedResult(result = OperationStartedResultResult.OperationId("op-3"))
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
        return ChainBytesResponse(result = ChainBytesResponseResult.Value(ByteArray(32)))
    }

    override suspend fun specChainName(request: ChainGenesisRequest): ChainStringResponse {
        Log.d(TAG, "specChainName")
        return ChainStringResponse(result = ChainStringResponseResult.Value("Mock Chain"))
    }

    override suspend fun specProperties(request: ChainGenesisRequest): ChainStringResponse {
        Log.d(TAG, "specProperties")
        return ChainStringResponse(
            result = ChainStringResponseResult.Value("{\"tokenSymbol\":\"DOT\",\"tokenDecimals\":10}")
        )
    }

    override suspend fun transactionBroadcast(request: ChainTransactionBroadcastRequest): ChainTransactionBroadcastResponse {
        Log.d(TAG, "transactionBroadcast")
        return ChainTransactionBroadcastResponse(
            result = ChainTransactionBroadcastResponseResult.Value(
                ChainTransactionBroadcastValue(operationId = "tx-op-1")
            )
        )
    }

    override suspend fun transactionStop(request: ChainTransactionStopRequest): ChainVoidResponse {
        Log.d(TAG, "transactionStop")
        return ChainVoidResponse(result = ChainVoidResponseResult.Ok)
    }
}

// -- ChatService --

class ChatServiceImpl : ChatService {
    override suspend fun createRoom(request: ChatRoomRequest): ChatRoomResponse {
        Log.d(TAG, "createRoom")
        return ChatRoomResponse(
            result = ChatRoomResponseResult.Ok(ChatRoomRegistrationResult())
        )
    }

    override suspend fun createSimpleGroup(request: SimpleGroupChatRequest): SimpleGroupChatResponse {
        Log.d(TAG, "createSimpleGroup")
        return SimpleGroupChatResponse(
            result = SimpleGroupChatResponseResult.Ok(
                SimpleGroupChatResult(joinLink = "https://mock.link/join")
            )
        )
    }

    override suspend fun registerBot(request: ChatBotRequest): ChatBotResponse {
        Log.d(TAG, "registerBot")
        return ChatBotResponse(
            result = ChatBotResponseResult.Ok(ChatBotRegistrationResult())
        )
    }

    override suspend fun postMessage(request: ChatPostMessageRequest): ChatPostMessageResponse {
        Log.d(TAG, "postMessage")
        return ChatPostMessageResponse(
            result = ChatPostMessageResponseResult.Ok(ChatPostMessageResult(messageId = "mock-msg-1"))
        )
    }

    override fun listSubscribe(request: ChatListRequest): Flow<ChatRoomList> = flow {
        Log.d(TAG, "listSubscribe")
        emit(ChatRoomList(rooms = listOf(
            ChatRoom(roomId = "room-1", participatingAs = ChatRoomParticipation.CHAT_ROOM_PARTICIPATION_ROOM_HOST)
        )))
    }

    override fun actionSubscribe(request: ChatActionRequest): Flow<ReceivedChatAction> = flow {
        Log.d(TAG, "actionSubscribe")
        emit(ReceivedChatAction(roomId = "room-1", peer = "peer-1", payload = ChatActionPayload()))
    }

    override fun customRenderSubscribe(requests: Flow<CustomRendererNode>): Flow<CustomMessageRenderRequest> = flow {
        Log.d(TAG, "customRenderSubscribe")
        emit(CustomMessageRenderRequest(messageId = "msg-1", messageType = "mock", payload = ByteArray(0)))
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
    private val store = mutableMapOf<String, ByteArray>()

    override suspend fun read(request: StorageReadRequest): StorageReadResponse {
        Log.d(TAG, "storage read: ${request.key}")
        val value = store[request.key]
        return if (value != null) {
            StorageReadResponse(result = StorageReadResponseResult.Value(StorageReadValue(data = value)))
        } else {
            StorageReadResponse(
                result = StorageReadResponseResult.Error(StorageError(reason = "Key not found"))
            )
        }
    }

    override suspend fun write(request: StorageWriteRequest): StorageWriteResponse {
        Log.d(TAG, "storage write: ${request.key}")
        store[request.key] = request.value
        return StorageWriteResponse(result = StorageWriteResponseResult.Ok)
    }

    override suspend fun clear(request: StorageClearRequest): StorageClearResponse {
        Log.d(TAG, "storage clear: ${request.key}")
        store.remove(request.key)
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
        emit(StatementList(statements = listOf(stmt3)))
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
