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
        return FeatureSupportedResponse()
    }

    override suspend fun navigateTo(request: NavigateToRequest): NavigateToResponse {
        Log.d(TAG, "navigateTo: ${request.url}")
        return NavigateToResponse()
    }

    override suspend fun pushNotification(request: PushNotification): PushNotificationResponse {
        Log.d(TAG, "pushNotification: ${request.text}")
        return PushNotificationResponse()
    }
}

// -- AccountService --

class AccountServiceImpl : AccountService {
    override suspend fun getAccount(request: GetAccountRequest): GetAccountResponse {
        Log.d(TAG, "getAccount")
        return GetAccountResponse()
    }

    override suspend fun getAlias(request: GetAliasRequest): GetAliasResponse {
        Log.d(TAG, "getAlias")
        return GetAliasResponse()
    }

    override suspend fun createProof(request: CreateProofRequest): CreateProofResponse {
        Log.d(TAG, "createProof")
        return CreateProofResponse()
    }

    override suspend fun getNonProductAccounts(request: GetNonProductAccountsRequest): GetNonProductAccountsResponse {
        Log.d(TAG, "getNonProductAccounts")
        return GetNonProductAccountsResponse()
    }

    override fun connectionStatusSubscribe(request: ConnectionStatusRequest): Flow<AccountConnectionStatusEvent> = flow {
        Log.d(TAG, "connectionStatusSubscribe")
        emit(AccountConnectionStatusEvent(status = AccountConnectionStatus.ACCOUNT_CONNECTION_STATUS_CONNECTED))
    }

    override suspend fun getUserId(request: GetUserIdRequest): GetUserIdResponse {
        Log.d(TAG, "getUserId")
        return GetUserIdResponse()
    }
}

// -- ChainService --

class ChainServiceImpl : ChainService {
    override fun headFollow(request: ChainHeadFollowRequest): Flow<ChainHeadEvent> = flow {
        Log.d(TAG, "headFollow")
        // Emit 3 events (all empty since ChainHeadEvent has no oneof fields in codegen)
        emit(ChainHeadEvent())
        emit(ChainHeadEvent())
        emit(ChainHeadEvent())
    }

    override suspend fun headHeader(request: ChainHeadBlockRequest): ChainHeadHeaderResponse {
        Log.d(TAG, "headHeader")
        return ChainHeadHeaderResponse()
    }

    override suspend fun headBody(request: ChainHeadBlockRequest): OperationStartedResponse {
        Log.d(TAG, "headBody")
        return OperationStartedResponse()
    }

    override suspend fun headStorage(request: ChainHeadStorageRequest): OperationStartedResponse {
        Log.d(TAG, "headStorage")
        return OperationStartedResponse()
    }

    override suspend fun headCall(request: ChainHeadCallRequest): OperationStartedResponse {
        Log.d(TAG, "headCall")
        return OperationStartedResponse()
    }

    override suspend fun headUnpin(request: ChainHeadUnpinRequest): ChainVoidResponse {
        Log.d(TAG, "headUnpin")
        return ChainVoidResponse()
    }

    override suspend fun headContinue(request: ChainHeadOperationRequest): ChainVoidResponse {
        Log.d(TAG, "headContinue")
        return ChainVoidResponse()
    }

    override suspend fun headStopOperation(request: ChainHeadOperationRequest): ChainVoidResponse {
        Log.d(TAG, "headStopOperation")
        return ChainVoidResponse()
    }

    override suspend fun specGenesisHash(request: ChainGenesisRequest): ChainBytesResponse {
        Log.d(TAG, "specGenesisHash")
        return ChainBytesResponse()
    }

    override suspend fun specChainName(request: ChainGenesisRequest): ChainStringResponse {
        Log.d(TAG, "specChainName")
        return ChainStringResponse()
    }

    override suspend fun specProperties(request: ChainGenesisRequest): ChainStringResponse {
        Log.d(TAG, "specProperties")
        return ChainStringResponse()
    }

    override suspend fun transactionBroadcast(request: ChainTransactionBroadcastRequest): ChainTransactionBroadcastResponse {
        Log.d(TAG, "transactionBroadcast")
        return ChainTransactionBroadcastResponse()
    }

    override suspend fun transactionStop(request: ChainTransactionStopRequest): ChainVoidResponse {
        Log.d(TAG, "transactionStop")
        return ChainVoidResponse()
    }
}

// -- ChatService --

class ChatServiceImpl : ChatService {
    override suspend fun createRoom(request: ChatRoomRequest): ChatRoomResponse {
        Log.d(TAG, "createRoom")
        return ChatRoomResponse()
    }

    override suspend fun createSimpleGroup(request: SimpleGroupChatRequest): SimpleGroupChatResponse {
        Log.d(TAG, "createSimpleGroup")
        return SimpleGroupChatResponse()
    }

    override suspend fun registerBot(request: ChatBotRequest): ChatBotResponse {
        Log.d(TAG, "registerBot")
        return ChatBotResponse()
    }

    override suspend fun postMessage(request: ChatPostMessageRequest): ChatPostMessageResponse {
        Log.d(TAG, "postMessage")
        return ChatPostMessageResponse()
    }

    override fun listSubscribe(request: ChatListRequest): Flow<ChatRoomList> = flow {
        Log.d(TAG, "listSubscribe")
        emit(ChatRoomList())
    }

    override fun actionSubscribe(request: ChatActionRequest): Flow<ReceivedChatAction> = flow {
        Log.d(TAG, "actionSubscribe")
        emit(ReceivedChatAction())
    }

    override fun customRenderSubscribe(requests: Flow<CustomRendererNode>): Flow<CustomMessageRenderRequest> = flow {
        Log.d(TAG, "customRenderSubscribe")
        emit(CustomMessageRenderRequest())
    }
}

// -- EntropyService --

class EntropyServiceImpl : EntropyService {
    override suspend fun deriveEntropy(request: DeriveEntropyRequest): DeriveEntropyResponse {
        Log.d(TAG, "deriveEntropy")
        return DeriveEntropyResponse()
    }
}

// -- LocalStorageService --

class LocalStorageServiceImpl : LocalStorageService {
    override suspend fun read(request: StorageReadRequest): StorageReadResponse {
        Log.d(TAG, "storage read: ${request.key}")
        return StorageReadResponse()
    }

    override suspend fun write(request: StorageWriteRequest): StorageWriteResponse {
        Log.d(TAG, "storage write: ${request.key}")
        return StorageWriteResponse()
    }

    override suspend fun clear(request: StorageClearRequest): StorageClearResponse {
        Log.d(TAG, "storage clear: ${request.key}")
        return StorageClearResponse()
    }
}

// -- PaymentService --

class PaymentServiceImpl : PaymentService {
    override fun balanceSubscribe(request: PaymentBalanceRequest): Flow<PaymentBalanceEvent> = flow {
        Log.d(TAG, "balanceSubscribe")
        emit(PaymentBalanceEvent())
    }

    override suspend fun topUp(request: PaymentTopUpRequest): PaymentTopUpResponse {
        Log.d(TAG, "topUp: ${request.amount}")
        return PaymentTopUpResponse()
    }

    override suspend fun request(request: PaymentRequestMsg): PaymentRequestResponse {
        Log.d(TAG, "payment request: ${request.amount}")
        return PaymentRequestResponse()
    }

    override fun statusSubscribe(request: PaymentStatusRequest): Flow<PaymentStatusEvent> = flow {
        Log.d(TAG, "statusSubscribe: ${request.paymentId}")
        emit(PaymentStatusEvent())
    }
}

// -- PermissionsService --

class PermissionsServiceImpl : PermissionsService {
    override suspend fun devicePermissionRequest(request: DevicePermissionRequestMsg): DevicePermissionResponse {
        Log.d(TAG, "devicePermissionRequest: ${request.permission}")
        return DevicePermissionResponse()
    }

    override suspend fun remotePermissionRequest(request: RemotePermissionRequestMsg): RemotePermissionResponse {
        Log.d(TAG, "remotePermissionRequest")
        return RemotePermissionResponse()
    }
}

// -- PreimageService --

class PreimageServiceImpl : PreimageService {
    override fun lookupSubscribe(request: PreimageLookupRequest): Flow<PreimageLookupEvent> = flow {
        Log.d(TAG, "lookupSubscribe")
        emit(PreimageLookupEvent())
    }
}

// -- SigningService --

class SigningServiceImpl : SigningService {
    override suspend fun signPayload(request: SigningPayload): SignPayloadResponse {
        Log.d(TAG, "signPayload")
        return SignPayloadResponse()
    }

    override suspend fun signRaw(request: SigningRawPayload): SignRawResponse {
        Log.d(TAG, "signRaw")
        return SignRawResponse()
    }

    override suspend fun createTransaction(request: CreateTransactionRequest): CreateTransactionResponse {
        Log.d(TAG, "createTransaction")
        return CreateTransactionResponse()
    }

    override suspend fun createTransactionNonProduct(request: CreateTransactionNonProductRequest): CreateTransactionResponse {
        Log.d(TAG, "createTransactionNonProduct")
        return CreateTransactionResponse()
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
        return StatementCreateProofResponse()
    }

    override suspend fun submit(request: StatementSubmitRequest): StatementSubmitResponse {
        Log.d(TAG, "statement submit")
        return StatementSubmitResponse()
    }
}
