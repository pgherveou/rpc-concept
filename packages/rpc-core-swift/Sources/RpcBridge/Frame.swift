// Frame.swift
// RpcBridge
//
// Typealiases and helpers for the RPC bridge frame protocol.
// Wire encoding/decoding is handled by SwiftProtobuf generated types.

import Foundation
import SwiftProtobuf

// MARK: - Type Aliases to Generated Types

public typealias FrameType = Rpc_Bridge_V1_FrameType
public typealias RpcFrame = Rpc_Bridge_V1_RpcFrame

// MARK: - Base64 Helpers

public func dataToBase64(_ data: Data) -> String {
    return data.base64EncodedString()
}

public func base64ToData(_ base64: String) -> Data? {
    return Data(base64Encoded: base64)
}

// MARK: - RpcFrame Convenience Extensions

extension RpcFrame {
    public func encode() -> Data {
        return (try? serializedData()) ?? Data()
    }

    public static func decode(from data: Data) -> RpcFrame {
        return (try? RpcFrame(serializedBytes: data)) ?? RpcFrame()
    }
}

// MARK: - Frame Factory Functions

public func createMessageFrame(streamId: UInt32, payload: Data) -> RpcFrame {
    var frame = RpcFrame()
    frame.type = .message
    frame.streamID = streamId
    frame.payload = payload
    return frame
}

public func createHalfCloseFrame(streamId: UInt32) -> RpcFrame {
    var frame = RpcFrame()
    frame.type = .halfClose
    frame.streamID = streamId
    return frame
}

public func createCloseFrame(streamId: UInt32) -> RpcFrame {
    var frame = RpcFrame()
    frame.type = .close
    frame.streamID = streamId
    return frame
}

public func createErrorFrame(
    streamId: UInt32,
    errorCode: UInt32,
    errorMessage: String
) -> RpcFrame {
    var frame = RpcFrame()
    frame.type = .error
    frame.streamID = streamId
    frame.errorCode = errorCode
    frame.errorMessage = errorMessage
    return frame
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
