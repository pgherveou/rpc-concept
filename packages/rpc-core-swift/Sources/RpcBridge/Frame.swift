// Frame.swift
// RpcBridge
//
// Helper functions for the RPC bridge frame protocol.
// The body types and RpcFrame struct are generated from frame.proto
// in Generated/RpcBridgeV1.swift.

import Foundation

// MARK: - AnyCodable

/// Type-erased Codable wrapper for arbitrary JSON values.
/// Used by MessageBody.payload to carry inline message JSON.
public struct AnyCodable: Codable, Sendable {
    public let value: Any & Sendable

    public init(_ value: Any & Sendable) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            self.value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0 as any Sendable) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0 as any Sendable) })
        default:
            throw EncodingError.invalidValue(value, .init(codingPath: encoder.codingPath, debugDescription: "Unsupported type"))
        }
    }
}

// MARK: - JSON Serialization

public func frameToJSON(_ frame: RpcFrame) throws -> String {
    let data = try JSONEncoder().encode(frame)
    return String(data: data, encoding: .utf8)!
}

public func frameFromJSON(_ json: String) throws -> RpcFrame {
    let data = json.data(using: .utf8)!
    return try JSONDecoder().decode(RpcFrame.self, from: data)
}

/// Extract the payload as JSON Data from a MessageBody.
public func payloadToJSONData(_ payload: AnyCodable?) throws -> Data {
    guard let payload else { return Data() }
    return try JSONEncoder().encode(payload)
}

// MARK: - Frame Factory Functions

public func createMessageFrame(streamId: UInt32, payload: Data) -> RpcFrame {
    let jsonObject = try? JSONSerialization.jsonObject(with: payload)
    let anyCodable = jsonObject.map { AnyCodable($0 as any Sendable) }
    var body = MessageBody()
    body.payload = anyCodable
    return RpcFrame(streamId: streamId, body: .message(body))
}

public func createHalfCloseFrame(streamId: UInt32) -> RpcFrame {
    RpcFrame(streamId: streamId, body: .halfClose)
}

public func createCloseFrame(streamId: UInt32) -> RpcFrame {
    RpcFrame(streamId: streamId, body: .close)
}

public func createErrorFrame(
    streamId: UInt32,
    errorCode: UInt32,
    errorMessage: String
) -> RpcFrame {
    var err = ErrorBody()
    err.errorCode = errorCode
    err.errorMessage = errorMessage
    return RpcFrame(streamId: streamId, body: .error(err))
}

/// Return a human-readable name for the frame's body type, for logging.
public func frameTypeName(_ frame: RpcFrame) -> String {
    switch frame.body {
    case .open: return "open"
    case .message: return "message"
    case .halfClose: return "halfClose"
    case .close: return "close"
    case .cancel: return "cancel"
    case .error: return "error"
    case .unknown: return "unknown"
    }
}

// MARK: - RPC Status Codes

public enum RpcStatusCode {
    public static let ok: UInt32 = 0
    public static let cancelled: UInt32 = 1
    public static let unknown: UInt32 = 2
    public static let invalidArgument: UInt32 = 3
    public static let deadlineExceeded: UInt32 = 4
    public static let notFound: UInt32 = 5
    public static let unimplemented: UInt32 = 12
    public static let `internal`: UInt32 = 13
    public static let unavailable: UInt32 = 14
}
