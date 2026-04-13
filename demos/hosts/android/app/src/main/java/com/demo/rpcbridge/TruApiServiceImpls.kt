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
        // Simulate a peer message after a short delay.
        kotlinx.coroutines.delay(500)
        emit(ReceivedChatAction(
            roomId = "room-1",
            peer = "alice",
            payload = ChatActionPayload(
                payload = ChatActionPayloadPayload.MessagePosted(
                    ChatMessageContent(content = ChatMessageContentContent.Text("Hello from Alice!"))
                )
            )
        ))
    }

    override fun customRenderSubscribe(requests: Flow<CustomRendererNode>): Flow<CustomMessageRenderRequest> = flow {
        Log.d(TAG, "customRenderSubscribe")
        // Send an initial render request then echo for each incoming node.
        emit(CustomMessageRenderRequest(messageId = "custom-1", messageType = "poll", payload = byteArrayOf(0x01)))
        requests.collect {
            emit(CustomMessageRenderRequest(messageId = "custom-2", messageType = "poll-update", payload = byteArrayOf(0x02)))
        }
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
