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

final class ChatServiceImpl: TruapiV02.ChatServiceProvider, Sendable {

    func createRoom(_ request: TruapiV02.ChatRoomRequest) async throws -> TruapiV02.ChatRoomResponse {
        var result = TruapiV02.ChatRoomRegistrationResult()
        result.status = .new
        return TruapiV02.ChatRoomResponse(result: .ok(result))
    }

    func createSimpleGroup(_ request: TruapiV02.SimpleGroupChatRequest) async throws -> TruapiV02.SimpleGroupChatResponse {
        var result = TruapiV02.SimpleGroupChatResult()
        result.status = .new
        return TruapiV02.SimpleGroupChatResponse(result: .ok(result))
    }

    func registerBot(_ request: TruapiV02.ChatBotRequest) async throws -> TruapiV02.ChatBotResponse {
        var result = TruapiV02.ChatBotRegistrationResult()
        result.status = .new
        return TruapiV02.ChatBotResponse(result: .ok(result))
    }

    func postMessage(_ request: TruapiV02.ChatPostMessageRequest) async throws -> TruapiV02.ChatPostMessageResponse {
        var result = TruapiV02.ChatPostMessageResult()
        result.messageId = "msg-1"
        return TruapiV02.ChatPostMessageResponse(result: .ok(result))
    }

    func listSubscribe(_ request: TruapiV02.ChatListRequest) -> AsyncThrowingStream<TruapiV02.ChatRoomList, Error> {
        AsyncThrowingStream { continuation in
            var room = TruapiV02.ChatRoom()
            room.roomId = "room-1"
            room.participatingAs = .roomHost
            var list = TruapiV02.ChatRoomList()
            list.rooms = [room]
            continuation.yield(list)
            continuation.finish()
        }
    }

    func actionSubscribe(_ request: TruapiV02.ChatActionRequest) -> AsyncThrowingStream<TruapiV02.ReceivedChatAction, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }

    func customRenderSubscribe(_ requests: AsyncStream<TruapiV02.CustomRendererNode>) -> AsyncThrowingStream<TruapiV02.CustomMessageRenderRequest, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
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
        let account = request.account
        print("[host] signPayload: account=\(account.dotNsIdentifier)/\(account.derivationIndex)")

        let methodData = Self.dataFromAnyCodable(request.method)
        let signature = Self.mockSignature(seed: methodData)
        var result = TruapiV02.SigningResult()
        result.signature = AnyCodable(signature)
        if request.withSignedTransaction {
            result.signedTransaction = AnyCodable(Self.mockSignedTransaction(signature: signature, callData: methodData))
        }
        return TruapiV02.SignPayloadResponse(result: .ok(result))
    }

    func signRaw(_ request: TruapiV02.SigningRawPayload) async throws -> TruapiV02.SignRawResponse {
        let account = request.account
        print("[host] signRaw: account=\(account.dotNsIdentifier)/\(account.derivationIndex)")

        let seed: Data
        switch request.data.payload {
        case .rawBytes(let bytes):
            seed = Self.dataFromAnyCodable(bytes)
        case .message(let msg):
            seed = Data(msg.utf8)
        default:
            seed = Data()
        }

        var result = TruapiV02.SigningResult()
        result.signature = AnyCodable(Self.mockSignature(seed: seed))
        return TruapiV02.SignRawResponse(result: .ok(result))
    }

    func createTransaction(_ request: TruapiV02.CreateTransactionRequest) async throws -> TruapiV02.CreateTransactionResponse {
        let account = request.account
        print("[host] createTransaction: account=\(account.dotNsIdentifier)/\(account.derivationIndex)")

        let callData = Self.extractCallData(from: request.payload)
        let signature = Self.mockSignature(seed: callData)
        let transaction = Self.mockSignedTransaction(signature: signature, callData: callData)
        return TruapiV02.CreateTransactionResponse(result: .transaction(AnyCodable(transaction)))
    }

    func createTransactionNonProduct(_ request: TruapiV02.CreateTransactionNonProductRequest) async throws -> TruapiV02.CreateTransactionResponse {
        print("[host] createTransactionNonProduct")

        let callData = Self.extractCallData(from: request.payload)
        let signature = Self.mockSignature(seed: callData)
        let transaction = Self.mockSignedTransaction(signature: signature, callData: callData)
        return TruapiV02.CreateTransactionResponse(result: .transaction(AnyCodable(transaction)))
    }

    // MARK: - Helpers

    private static func dataFromAnyCodable(_ value: AnyCodable?) -> Data {
        if let data = value?.value as? Data { return data }
        if let string = value?.value as? String { return Data(string.utf8) }
        return Data()
    }

    private static func mockSignature(seed: Data) -> Data {
        var sig = Data(count: 64)
        for i in 0..<64 {
            sig[i] = seed.isEmpty ? UInt8(i &* 3) : seed[i % seed.count] ^ UInt8(i &* 7)
        }
        return sig
    }

    private static func mockSignedTransaction(signature: Data, callData: Data) -> Data {
        var tx = Data(capacity: 1 + signature.count + callData.count)
        tx.append(0x84) // extrinsic version prefix
        tx.append(signature)
        tx.append(callData)
        return tx
    }

    private static func extractCallData(from payload: TruapiV02.VersionedTxPayload) -> Data {
        if case .v1(let v1) = payload.version {
            return dataFromAnyCodable(v1.callData)
        }
        return Data()
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
