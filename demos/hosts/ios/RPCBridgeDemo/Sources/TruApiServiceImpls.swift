// Mock implementations of all TruAPI v02 service provider protocols.
// Returns sensible stub data for demo / playground use.

import Foundation
import RpcBridge

// MARK: - GeneralServiceImpl

final class GeneralServiceImpl: TruapiV02.GeneralServiceProvider, Sendable {

    func featureSupported(_ request: TruapiV02.FeatureSupportedRequest) async throws -> TruapiV02.FeatureSupportedResponse {
        TruapiV02.FeatureSupportedResponse(result: .supported(true))
    }

    func navigateTo(_ request: TruapiV02.NavigateToRequest) async throws -> TruapiV02.NavigateToResponse {
        TruapiV02.NavigateToResponse(result: .ok)
    }

    func pushNotification(_ request: TruapiV02.PushNotification) async throws -> TruapiV02.PushNotificationResponse {
        TruapiV02.PushNotificationResponse(result: .ok)
    }
}

// MARK: - AccountServiceImpl

final class AccountServiceImpl: TruapiV02.AccountServiceProvider, Sendable {

    func getAccount(_ request: TruapiV02.GetAccountRequest) async throws -> TruapiV02.GetAccountResponse {
        var account = TruapiV02.Account()
        account.name = "Alice"
        return TruapiV02.GetAccountResponse(result: .account(account))
    }

    func getAlias(_ request: TruapiV02.GetAliasRequest) async throws -> TruapiV02.GetAliasResponse {
        TruapiV02.GetAliasResponse(result: .alias(TruapiV02.ContextualAlias()))
    }

    func createProof(_ request: TruapiV02.CreateProofRequest) async throws -> TruapiV02.CreateProofResponse {
        TruapiV02.CreateProofResponse(result: .proof(AnyCodable("mock-proof")))
    }

    func getNonProductAccounts(_ request: TruapiV02.GetNonProductAccountsRequest) async throws -> TruapiV02.GetNonProductAccountsResponse {
        TruapiV02.GetNonProductAccountsResponse(result: .accounts(TruapiV02.AccountList()))
    }

    func connectionStatusSubscribe(_ request: TruapiV02.ConnectionStatusRequest) -> AsyncThrowingStream<TruapiV02.AccountConnectionStatusEvent, Error> {
        AsyncThrowingStream { continuation in
            var event = TruapiV02.AccountConnectionStatusEvent()
            event.status = .connected
            continuation.yield(event)
            continuation.finish()
        }
    }

    func getUserId(_ request: TruapiV02.GetUserIdRequest) async throws -> TruapiV02.GetUserIdResponse {
        var identity = TruapiV02.UserIdentity()
        identity.dotNsIdentifier = "alice.dot"
        return TruapiV02.GetUserIdResponse(result: .identity(identity))
    }
}

// MARK: - ChainServiceImpl

final class ChainServiceImpl: TruapiV02.ChainServiceProvider, Sendable {

    func headFollow(_ request: TruapiV02.ChainHeadFollowRequest) -> AsyncThrowingStream<TruapiV02.ChainHeadEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(TruapiV02.ChainHeadEvent(event: .initialized(TruapiV02.Initialized())))
            continuation.yield(TruapiV02.ChainHeadEvent(event: .newBlock(TruapiV02.NewBlock())))
            continuation.yield(TruapiV02.ChainHeadEvent(event: .bestBlockChanged(TruapiV02.BestBlockChanged())))
            continuation.finish()
        }
    }

    func headHeader(_ request: TruapiV02.ChainHeadBlockRequest) async throws -> TruapiV02.ChainHeadHeaderResponse {
        TruapiV02.ChainHeadHeaderResponse(result: .value(TruapiV02.ChainHeadHeaderValue()))
    }

    func headBody(_ request: TruapiV02.ChainHeadBlockRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value)
    }

    func headStorage(_ request: TruapiV02.ChainHeadStorageRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value)
    }

    func headCall(_ request: TruapiV02.ChainHeadCallRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value)
    }

    func headUnpin(_ request: TruapiV02.ChainHeadUnpinRequest) async throws -> TruapiV02.ChainVoidResponse {
        TruapiV02.ChainVoidResponse(result: .ok)
    }

    func headContinue(_ request: TruapiV02.ChainHeadOperationRequest) async throws -> TruapiV02.ChainVoidResponse {
        TruapiV02.ChainVoidResponse(result: .ok)
    }

    func headStopOperation(_ request: TruapiV02.ChainHeadOperationRequest) async throws -> TruapiV02.ChainVoidResponse {
        TruapiV02.ChainVoidResponse(result: .ok)
    }

    func specGenesisHash(_ request: TruapiV02.ChainGenesisRequest) async throws -> TruapiV02.ChainBytesResponse {
        TruapiV02.ChainBytesResponse(result: .value(AnyCodable("0x0000")))
    }

    func specChainName(_ request: TruapiV02.ChainGenesisRequest) async throws -> TruapiV02.ChainStringResponse {
        TruapiV02.ChainStringResponse(result: .value("Mock Chain"))
    }

    func specProperties(_ request: TruapiV02.ChainGenesisRequest) async throws -> TruapiV02.ChainStringResponse {
        TruapiV02.ChainStringResponse(result: .value("{\"tokenDecimals\":10,\"tokenSymbol\":\"DOT\"}"))
    }

    func transactionBroadcast(_ request: TruapiV02.ChainTransactionBroadcastRequest) async throws -> TruapiV02.ChainTransactionBroadcastResponse {
        var value = TruapiV02.ChainTransactionBroadcastValue()
        value.operationId = "op-1"
        return TruapiV02.ChainTransactionBroadcastResponse(result: .value(value))
    }

    func transactionStop(_ request: TruapiV02.ChainTransactionStopRequest) async throws -> TruapiV02.ChainVoidResponse {
        TruapiV02.ChainVoidResponse(result: .ok)
    }
}

// MARK: - ChatServiceImpl

final class ChatServiceImpl: TruapiV02.ChatServiceProvider {

    private let state = ChatState()

    func createRoom(_ request: TruapiV02.ChatRoomRequest) async throws -> TruapiV02.ChatRoomResponse {
        let status = await state.addRoom(id: request.roomId, participation: .roomHost)
        var result = TruapiV02.ChatRoomRegistrationResult()
        result.status = status
        return TruapiV02.ChatRoomResponse(result: .ok(result))
    }

    func createSimpleGroup(_ request: TruapiV02.SimpleGroupChatRequest) async throws -> TruapiV02.SimpleGroupChatResponse {
        let status = await state.addRoom(id: request.roomId, participation: .roomHost)
        var result = TruapiV02.SimpleGroupChatResult()
        result.status = status
        result.joinLink = "https://mock.link/join/\(request.roomId)"
        return TruapiV02.SimpleGroupChatResponse(result: .ok(result))
    }

    func registerBot(_ request: TruapiV02.ChatBotRequest) async throws -> TruapiV02.ChatBotResponse {
        let status = await state.addBot(id: request.botId)
        var result = TruapiV02.ChatBotRegistrationResult()
        result.status = status
        return TruapiV02.ChatBotResponse(result: .ok(result))
    }

    func postMessage(_ request: TruapiV02.ChatPostMessageRequest) async throws -> TruapiV02.ChatPostMessageResponse {
        let messageId = await state.nextMessageId()
        var result = TruapiV02.ChatPostMessageResult()
        result.messageId = messageId
        return TruapiV02.ChatPostMessageResponse(result: .ok(result))
    }

    func listSubscribe(_ request: TruapiV02.ChatListRequest) -> AsyncThrowingStream<TruapiV02.ChatRoomList, Error> {
        AsyncThrowingStream { [state] continuation in
            let task = Task {
                let stream = await state.roomListStream()
                for await list in stream {
                    continuation.yield(list)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func actionSubscribe(_ request: TruapiV02.ChatActionRequest) -> AsyncThrowingStream<TruapiV02.ReceivedChatAction, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                // Simulate a peer message after a short delay.
                try? await Task.sleep(nanoseconds: 500_000_000)
                var action = TruapiV02.ReceivedChatAction()
                action.roomId = "room-1"
                action.peer = "alice"
                action.payload = TruapiV02.ChatActionPayload(payload: .messagePosted)
                continuation.yield(action)
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func customRenderSubscribe(_ requests: AsyncStream<TruapiV02.CustomRendererNode>) -> AsyncThrowingStream<TruapiV02.CustomMessageRenderRequest, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                // Send an initial render request.
                var req = TruapiV02.CustomMessageRenderRequest()
                req.messageId = "custom-1"
                req.messageType = "poll"
                req.payload = AnyCodable(Data([0x01]).base64EncodedString())
                continuation.yield(req)

                // Echo a render request for each incoming node.
                for await _ in requests {
                    var update = TruapiV02.CustomMessageRenderRequest()
                    update.messageId = "custom-2"
                    update.messageType = "poll-update"
                    update.payload = AnyCodable(Data([0x02]).base64EncodedString())
                    continuation.yield(update)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

// Thread-safe in-memory chat state shared by ChatServiceImpl methods.
private actor ChatState {
    private var rooms: [String: TruapiV02.ChatRoom] = [:]
    private var botIds: Set<String> = []
    private var msgSeq = 0
    private var listContinuations: [UUID: AsyncStream<TruapiV02.ChatRoomList>.Continuation] = [:]

    func addRoom(id: String, participation: TruapiV02.ChatRoomParticipation) -> TruapiV02.ChatRoomRegistrationStatus {
        if rooms[id] != nil { return .exists }
        var room = TruapiV02.ChatRoom()
        room.roomId = id
        room.participatingAs = participation
        rooms[id] = room
        notifyListListeners()
        return .new
    }

    func addBot(id: String) -> TruapiV02.ChatBotRegistrationStatus {
        if botIds.contains(id) { return .exists }
        botIds.insert(id)
        return .new
    }

    func nextMessageId() -> String {
        msgSeq += 1
        return "msg-\(msgSeq)"
    }

    func roomListStream() -> AsyncStream<TruapiV02.ChatRoomList> {
        let id = UUID()
        return AsyncStream { continuation in
            // Emit current snapshot immediately.
            var list = TruapiV02.ChatRoomList()
            list.rooms = Array(rooms.values)
            continuation.yield(list)
            listContinuations[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { await self?.removeListContinuation(id: id) }
            }
        }
    }

    private func removeListContinuation(id: UUID) {
        listContinuations.removeValue(forKey: id)
    }

    private func notifyListListeners() {
        var list = TruapiV02.ChatRoomList()
        list.rooms = Array(rooms.values)
        for cont in listContinuations.values { cont.yield(list) }
    }
}

// MARK: - EntropyServiceImpl

final class EntropyServiceImpl: TruapiV02.EntropyServiceProvider, Sendable {

    func deriveEntropy(_ request: TruapiV02.DeriveEntropyRequest) async throws -> TruapiV02.DeriveEntropyResponse {
        TruapiV02.DeriveEntropyResponse(result: .entropy(AnyCodable("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")))
    }
}

// MARK: - LocalStorageServiceImpl

final class LocalStorageServiceImpl: TruapiV02.LocalStorageServiceProvider, Sendable {

    func read(_ request: TruapiV02.StorageReadRequest) async throws -> TruapiV02.StorageReadResponse {
        var err = TruapiV02.StorageError()
        err.code = .unspecified
        err.reason = "Key not found"
        return TruapiV02.StorageReadResponse(result: .error(err))
    }

    func write(_ request: TruapiV02.StorageWriteRequest) async throws -> TruapiV02.StorageWriteResponse {
        TruapiV02.StorageWriteResponse(result: .ok)
    }

    func clear(_ request: TruapiV02.StorageClearRequest) async throws -> TruapiV02.StorageClearResponse {
        TruapiV02.StorageClearResponse(result: .ok)
    }
}

// MARK: - PaymentServiceImpl

final class PaymentServiceImpl: TruapiV02.PaymentServiceProvider, Sendable {

    func balanceSubscribe(_ request: TruapiV02.PaymentBalanceRequest) -> AsyncThrowingStream<TruapiV02.PaymentBalanceEvent, Error> {
        AsyncThrowingStream { continuation in
            var balance = TruapiV02.PaymentBalance()
            balance.available = "1000000000000"
            balance.pending = "0"
            continuation.yield(TruapiV02.PaymentBalanceEvent(result: .balance(balance)))
            continuation.finish()
        }
    }

    func topUp(_ request: TruapiV02.PaymentTopUpRequest) async throws -> TruapiV02.PaymentTopUpResponse {
        TruapiV02.PaymentTopUpResponse(result: .ok)
    }

    func request(_ request: TruapiV02.PaymentRequestMsg) async throws -> TruapiV02.PaymentRequestResponse {
        var receipt = TruapiV02.PaymentReceipt()
        receipt.id = "receipt-1"
        return TruapiV02.PaymentRequestResponse(result: .receipt(receipt))
    }

    func statusSubscribe(_ request: TruapiV02.PaymentStatusRequest) -> AsyncThrowingStream<TruapiV02.PaymentStatusEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(TruapiV02.PaymentStatusEvent(result: .status))
            continuation.finish()
        }
    }
}

// MARK: - PermissionsServiceImpl

final class PermissionsServiceImpl: TruapiV02.PermissionsServiceProvider, Sendable {

    func devicePermissionRequest(_ request: TruapiV02.DevicePermissionRequestMsg) async throws -> TruapiV02.DevicePermissionResponse {
        TruapiV02.DevicePermissionResponse(result: .granted(true))
    }

    func remotePermissionRequest(_ request: TruapiV02.RemotePermissionRequestMsg) async throws -> TruapiV02.RemotePermissionResponse {
        TruapiV02.RemotePermissionResponse(result: .granted(true))
    }
}

// MARK: - PreimageServiceImpl

final class PreimageServiceImpl: TruapiV02.PreimageServiceProvider, Sendable {

    func lookupSubscribe(_ request: TruapiV02.PreimageLookupRequest) -> AsyncThrowingStream<TruapiV02.PreimageLookupEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(TruapiV02.PreimageLookupEvent())
            continuation.finish()
        }
    }
}

// MARK: - SigningServiceImpl

final class SigningServiceImpl: TruapiV02.SigningServiceProvider, Sendable {

    func signPayload(_ request: TruapiV02.SigningPayload) async throws -> TruapiV02.SignPayloadResponse {
        TruapiV02.SignPayloadResponse(result: .ok(TruapiV02.SigningResult()))
    }

    func signRaw(_ request: TruapiV02.SigningRawPayload) async throws -> TruapiV02.SignRawResponse {
        TruapiV02.SignRawResponse(result: .ok(TruapiV02.SigningResult()))
    }

    func createTransaction(_ request: TruapiV02.CreateTransactionRequest) async throws -> TruapiV02.CreateTransactionResponse {
        TruapiV02.CreateTransactionResponse(result: .transaction(AnyCodable("0xmocktx")))
    }

    func createTransactionNonProduct(_ request: TruapiV02.CreateTransactionNonProductRequest) async throws -> TruapiV02.CreateTransactionResponse {
        TruapiV02.CreateTransactionResponse(result: .transaction(AnyCodable("0xmocktx")))
    }
}

// MARK: - StatementStoreServiceImpl

final class StatementStoreServiceImpl: TruapiV02.StatementStoreServiceProvider, Sendable {

    func subscribe(_ request: TruapiV02.TopicFilter) -> AsyncThrowingStream<TruapiV02.StatementList, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(TruapiV02.StatementList())
            continuation.finish()
        }
    }

    func createProof(_ request: TruapiV02.StatementCreateProofRequest) async throws -> TruapiV02.StatementCreateProofResponse {
        TruapiV02.StatementCreateProofResponse(result: .proof)
    }

    func submit(_ request: TruapiV02.StatementSubmitRequest) async throws -> TruapiV02.StatementSubmitResponse {
        TruapiV02.StatementSubmitResponse(result: .hash("0xmockhash"))
    }
}
