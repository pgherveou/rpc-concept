// Mock implementations of all TruAPI v02 service provider protocols.
// Returns sensible stub data for demo / playground use.

import Foundation
import CryptoKit
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

    // Mock root public key (deterministic): 32 bytes, first two 0xaa 0xbb, rest zeros.
    private static let mockRootKey: AnyCodable = {
        var key = Data(count: 32)
        key[0] = 0xAA
        key[1] = 0xBB
        return AnyCodable(key.base64EncodedString())
    }()

    // Derive a deterministic mock public key from dotNsIdentifier and derivationIndex.
    private static func deriveProductKey(_ dotNsIdentifier: String, _ derivationIndex: Int) -> AnyCodable {
        var key = Data(count: 32)
        let utf8 = Array(dotNsIdentifier.utf8)
        for i in 0..<min(utf8.count, 30) {
            key[i] = utf8[i]
        }
        key[30] = UInt8((derivationIndex >> 8) & 0xFF)
        key[31] = UInt8(derivationIndex & 0xFF)
        return AnyCodable(key.base64EncodedString())
    }

    func getAccount(_ request: TruapiV02.GetAccountRequest) async throws -> TruapiV02.GetAccountResponse {
        let publicKey = Self.deriveProductKey(request.account.dotNsIdentifier, Int(request.account.derivationIndex))
        var account = TruapiV02.Account()
        account.publicKey = publicKey
        account.name = "Alice"
        return TruapiV02.GetAccountResponse(result: .account(account))
    }

    func getAlias(_ request: TruapiV02.GetAliasRequest) async throws -> TruapiV02.GetAliasResponse {
        // Ring VRF alias not yet implemented
        var err = TruapiV02.RequestCredentialsError()
        err.code = .unknown
        err.reason = "Ring VRF alias not yet implemented"
        return TruapiV02.GetAliasResponse(result: .error(err))
    }

    func createProof(_ request: TruapiV02.CreateProofRequest) async throws -> TruapiV02.CreateProofResponse {
        // Ring VRF proof not yet implemented
        var err = TruapiV02.CreateProofError()
        err.code = .unknown
        err.reason = "Ring VRF proof not yet implemented"
        return TruapiV02.CreateProofResponse(result: .error(err))
    }

    func getNonProductAccounts(_ request: TruapiV02.GetNonProductAccountsRequest) async throws -> TruapiV02.GetNonProductAccountsResponse {
        var rootAccount = TruapiV02.Account()
        rootAccount.publicKey = Self.mockRootKey
        rootAccount.name = "Alice"
        var list = TruapiV02.AccountList()
        list.accounts = [rootAccount]
        return TruapiV02.GetNonProductAccountsResponse(result: .accounts(list))
    }

    func connectionStatusSubscribe(_ request: TruapiV02.ConnectionStatusRequest) -> AsyncThrowingStream<TruapiV02.AccountConnectionStatusEvent, Error> {
        // Playground is always authenticated
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
        identity.publicKey = Self.mockRootKey
        return TruapiV02.GetUserIdResponse(result: .identity(identity))
    }
}

// MARK: - ChainServiceImpl

final class ChainServiceImpl: TruapiV02.ChainServiceProvider, Sendable {

    // Polkadot genesis hash
    private static let polkadotGenesis = "0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"

    private static func polkadotRuntime() -> TruapiV02.RuntimeType {
        var spec = TruapiV02.RuntimeSpec()
        spec.specName = "polkadot"
        spec.implName = "parity-polkadot"
        spec.specVersion = 1_003_004
        spec.implVersion = 0
        spec.transactionVersion = 26
        spec.apis = [
            { var a = TruapiV02.RuntimeApi(); a.name = "Core"; a.version = 5; return a }(),
            { var a = TruapiV02.RuntimeApi(); a.name = "Metadata"; a.version = 2; return a }(),
            { var a = TruapiV02.RuntimeApi(); a.name = "BlockBuilder"; a.version = 6; return a }(),
            { var a = TruapiV02.RuntimeApi(); a.name = "TaggedTransactionQueue"; a.version = 3; return a }(),
            { var a = TruapiV02.RuntimeApi(); a.name = "AccountNonceApi"; a.version = 1; return a }(),
            { var a = TruapiV02.RuntimeApi(); a.name = "TransactionPaymentApi"; a.version = 4; return a }(),
        ]
        return TruapiV02.RuntimeType(runtime: .valid(spec))
    }

    private static func randomHex() -> String {
        let bytes = (0..<32).map { _ in UInt8.random(in: 0...255) }
        return "0x" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    private let opCounter = OpCounter()

    func headFollow(_ request: TruapiV02.ChainHeadFollowRequest) -> AsyncThrowingStream<TruapiV02.ChainHeadEvent, Error> {
        let opCounter = self.opCounter
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let finalizedHash = Self.randomHex()

                    // Initialized event
                    var init_ = TruapiV02.Initialized()
                    init_.finalizedBlockHashes = [AnyCodable(finalizedHash)]
                    init_.finalizedBlockRuntime = Self.polkadotRuntime()
                    continuation.yield(TruapiV02.ChainHeadEvent(event: .initialized(init_)))

                    // Simulate 5 new blocks
                    var parentHash = finalizedHash
                    var pendingHashes: [String] = []

                    for i in 0..<5 {
                        try await Task.sleep(nanoseconds: 2_000_000_000)

                        let blockHash = Self.randomHex()
                        pendingHashes.append(blockHash)

                        var newBlock = TruapiV02.NewBlock()
                        newBlock.blockHash = AnyCodable(blockHash)
                        newBlock.parentBlockHash = AnyCodable(parentHash)
                        continuation.yield(TruapiV02.ChainHeadEvent(event: .newBlock(newBlock)))

                        var best = TruapiV02.BestBlockChanged()
                        best.bestBlockHash = AnyCodable(blockHash)
                        continuation.yield(TruapiV02.ChainHeadEvent(event: .bestBlockChanged(best)))

                        // Finalize every 2 blocks
                        if pendingHashes.count >= 2 {
                            var fin = TruapiV02.Finalized()
                            fin.finalizedBlockHashes = pendingHashes.map { AnyCodable($0) }
                            continuation.yield(TruapiV02.ChainHeadEvent(event: .finalized(fin)))
                            pendingHashes.removeAll()
                        }

                        parentHash = blockHash
                    }

                    // Finalize remaining
                    if !pendingHashes.isEmpty {
                        var fin = TruapiV02.Finalized()
                        fin.finalizedBlockHashes = pendingHashes.map { AnyCodable($0) }
                        continuation.yield(TruapiV02.ChainHeadEvent(event: .finalized(fin)))
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func headHeader(_ request: TruapiV02.ChainHeadBlockRequest) async throws -> TruapiV02.ChainHeadHeaderResponse {
        var headerValue = TruapiV02.ChainHeadHeaderValue()
        headerValue.header = AnyCodable(Self.randomHex())
        return TruapiV02.ChainHeadHeaderResponse(result: .value(headerValue))
    }

    func headBody(_ request: TruapiV02.ChainHeadBlockRequest) async throws -> TruapiV02.OperationStartedResponse {
<<<<<<< HEAD
        TruapiV02.OperationStartedResponse(result: .value(TruapiV02.OperationStartedResult(result: .operationId(opCounter.next()))))
    }

    func headStorage(_ request: TruapiV02.ChainHeadStorageRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value(TruapiV02.OperationStartedResult(result: .operationId(opCounter.next()))))
    }

    func headCall(_ request: TruapiV02.ChainHeadCallRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value(TruapiV02.OperationStartedResult(result: .operationId(opCounter.next()))))
=======
        TruapiV02.OperationStartedResponse(result: .value(TruapiV02.OperationStartedResult(result: .operationId("op-1"))))
    }

    func headStorage(_ request: TruapiV02.ChainHeadStorageRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value(TruapiV02.OperationStartedResult(result: .operationId("op-2"))))
    }

    func headCall(_ request: TruapiV02.ChainHeadCallRequest) async throws -> TruapiV02.OperationStartedResponse {
        TruapiV02.OperationStartedResponse(result: .value(TruapiV02.OperationStartedResult(result: .operationId("op-3"))))
>>>>>>> origin/pg/impl-payment-service
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
        TruapiV02.ChainBytesResponse(result: .value(AnyCodable(Self.polkadotGenesis)))
    }

    func specChainName(_ request: TruapiV02.ChainGenesisRequest) async throws -> TruapiV02.ChainStringResponse {
        TruapiV02.ChainStringResponse(result: .value("Polkadot"))
    }

    func specProperties(_ request: TruapiV02.ChainGenesisRequest) async throws -> TruapiV02.ChainStringResponse {
        TruapiV02.ChainStringResponse(result: .value("{\"ss58Format\":0,\"tokenDecimals\":10,\"tokenSymbol\":\"DOT\"}"))
    }

    func transactionBroadcast(_ request: TruapiV02.ChainTransactionBroadcastRequest) async throws -> TruapiV02.ChainTransactionBroadcastResponse {
        var value = TruapiV02.ChainTransactionBroadcastValue()
        value.operationId = opCounter.next()
        return TruapiV02.ChainTransactionBroadcastResponse(result: .value(value))
    }

    func transactionStop(_ request: TruapiV02.ChainTransactionStopRequest) async throws -> TruapiV02.ChainVoidResponse {
        TruapiV02.ChainVoidResponse(result: .ok)
    }
}

// Thread-safe operation counter shared across service impls.
private final class OpCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: Int = 0

    func next() -> String {
        lock.lock()
        defer { lock.unlock() }
        _value += 1
        return "op-\(_value)"
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
        // No real chat peers in the playground, so nothing to emit.
        AsyncThrowingStream { continuation in continuation.finish() }
    }

    func customRenderSubscribe(_ requests: AsyncStream<TruapiV02.CustomRendererNode>) -> AsyncThrowingStream<TruapiV02.CustomMessageRenderRequest, Error> {
        // No custom message types in the playground. Consume the stream without emitting.
        AsyncThrowingStream { continuation in
            let task = Task {
                for await _ in requests {}
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

    // Fixed 32-byte mock root seed simulating BIP-39 root entropy.
    private static let mockRootSeed = Data([
        0x4d, 0x6f, 0x63, 0x6b, 0x52, 0x6f, 0x6f, 0x74,
        0x53, 0x65, 0x65, 0x64, 0x5f, 0x30, 0x31, 0x32,
        0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x61,
        0x62, 0x63, 0x64, 0x65, 0x66, 0x30, 0x31, 0x32,
    ])

    func deriveEntropy(_ request: TruapiV02.DeriveEntropyRequest) async throws -> TruapiV02.DeriveEntropyResponse {
        // Deterministic derivation: SHA-256(rootSeed || key) as a stand-in for
        // the real three-layer BLAKE2b-256 keyed hashing scheme.
        let keyData: Data
        if let d = request.key?.value as? Data {
            keyData = d
        } else if let s = request.key?.value as? String, let d = Data(base64Encoded: s) {
            keyData = d
        } else {
            keyData = Data()
        }
        var hasher = SHA256()
        hasher.update(data: Self.mockRootSeed)
        hasher.update(data: keyData)
        let entropy = Data(hasher.finalize())
        return TruapiV02.DeriveEntropyResponse(result: .entropy(AnyCodable(entropy)))
    }
}

// MARK: - LocalStorageServiceImpl

final class LocalStorageServiceImpl: TruapiV02.LocalStorageServiceProvider, @unchecked Sendable {

    private let prefix = "truapi:"
    private let lock = NSLock()
    private var store: [String: AnyCodable] = [:]

    func read(_ request: TruapiV02.StorageReadRequest) async throws -> TruapiV02.StorageReadResponse {
        let key = prefix + request.key
        lock.lock()
        let data = store[key]
        lock.unlock()
        var value = TruapiV02.StorageReadValue()
        if let data { value.data = data }
        return TruapiV02.StorageReadResponse(result: .value(value))
    }

    func write(_ request: TruapiV02.StorageWriteRequest) async throws -> TruapiV02.StorageWriteResponse {
        let key = prefix + request.key
        lock.lock()
        store[key] = request.value
        lock.unlock()
        return TruapiV02.StorageWriteResponse(result: .ok)
    }

    func clear(_ request: TruapiV02.StorageClearRequest) async throws -> TruapiV02.StorageClearResponse {
        let key = prefix + request.key
        lock.lock()
        store.removeValue(forKey: key)
        lock.unlock()
        return TruapiV02.StorageClearResponse(result: .ok)
    }
}

// MARK: - PaymentServiceImpl

final class PaymentServiceImpl: TruapiV02.PaymentServiceProvider, @unchecked Sendable {

    private let lock = NSLock()
    private var paymentCounter = 0

    func balanceSubscribe(_ request: TruapiV02.PaymentBalanceRequest) -> AsyncThrowingStream<TruapiV02.PaymentBalanceEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                var balance = TruapiV02.PaymentBalance()
                balance.available = "1000000000000"
                balance.pending = "0"
                continuation.yield(TruapiV02.PaymentBalanceEvent(result: .balance(balance)))
                // Keep stream open (production pushes updates as balance changes).
                while !Task.isCancelled {
                    try await Task.sleep(nanoseconds: UInt64.max)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func topUp(_ request: TruapiV02.PaymentTopUpRequest) async throws -> TruapiV02.PaymentTopUpResponse {
        TruapiV02.PaymentTopUpResponse(result: .ok)
    }

    func request(_ request: TruapiV02.PaymentRequestMsg) async throws -> TruapiV02.PaymentRequestResponse {
        lock.lock()
        defer { lock.unlock() }
        paymentCounter += 1
        var receipt = TruapiV02.PaymentReceipt()
        receipt.id = "pay-\(paymentCounter)"
        return TruapiV02.PaymentRequestResponse(result: .receipt(receipt))
    }

    func statusSubscribe(_ request: TruapiV02.PaymentStatusRequest) -> AsyncThrowingStream<TruapiV02.PaymentStatusEvent, Error> {
        AsyncThrowingStream { continuation in
<<<<<<< HEAD
            continuation.yield(TruapiV02.PaymentStatusEvent(result: .status(TruapiV02.PaymentStatus(status: .completed))))
            continuation.finish()
=======
            let task = Task {
                var paymentStatus = TruapiV02.PaymentStatus()
                paymentStatus.status = .processing
                continuation.yield(TruapiV02.PaymentStatusEvent(result: .status(paymentStatus)))
                // Keep stream open (production pushes updates as payment progresses).
                while !Task.isCancelled {
                    try await Task.sleep(nanoseconds: UInt64.max)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
>>>>>>> origin/pg/impl-payment-service
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
<<<<<<< HEAD
        TruapiV02.StatementCreateProofResponse(result: .proof(TruapiV02.StatementProof()))
=======
        var err = TruapiV02.StatementProofError()
        err.reason = "Not implemented"
        return TruapiV02.StatementCreateProofResponse(result: .error(err))
>>>>>>> origin/pg/impl-payment-service
    }

    func submit(_ request: TruapiV02.StatementSubmitRequest) async throws -> TruapiV02.StatementSubmitResponse {
        TruapiV02.StatementSubmitResponse(result: .hash("0xmockhash"))
    }
}
