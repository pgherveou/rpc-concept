// ProtobufHelpers.swift
// RPCBridgeDemo
//
// Hand-rolled protobuf wire format encoder/decoder for the RPC bridge protocol.
// This is wire-compatible with the TypeScript ProtoWriter/ProtoReader in
// @rpc-bridge/core, enabling seamless cross-platform communication.
//
// The implementation covers:
// - Varint encoding/decoding (LEB128)
// - Length-delimited fields (bytes, strings, sub-messages)
// - Tag-based field identification (field number + wire type)
// - Map<string, string> encoding as repeated sub-messages
// - Base64 encoding/decoding for WKWebView transport
// - RpcFrame struct matching proto/rpc/bridge/v1/frame.proto

import Foundation

// MARK: - Wire Format Constants

/// Protobuf wire types used in the RPC bridge protocol.
enum WireType {
    static let varint: UInt64 = 0
    static let fixed64: UInt64 = 1
    static let lengthDelimited: UInt64 = 2
    static let fixed32: UInt64 = 5
}

// MARK: - Frame Type Enum

/// Frame types matching the FrameType enum in frame.proto.
/// Receivers must ignore unknown frame types for forward compatibility.
enum FrameType: UInt32, Sendable {
    case unspecified = 0
    case handshake = 1
    case open = 2
    case message = 3
    case halfClose = 4
    case close = 5
    case cancel = 6
    case error = 7
    case requestN = 8
}

// MARK: - Method Type Enum

/// Method streaming patterns matching MethodType in frame.proto.
enum MethodType: UInt32, Sendable {
    case unspecified = 0
    case unary = 1
    case serverStreaming = 2
    case clientStreaming = 3
    case bidiStreaming = 4
}

// MARK: - RpcFrame

/// The fundamental unit of communication in the bridge protocol.
/// Every interaction between web content and native host is expressed as
/// one or more RpcFrame values. This struct mirrors the protobuf definition
/// in proto/rpc/bridge/v1/frame.proto.
struct RpcFrame: Sendable {
    // Core fields (present on all frames)
    var type: FrameType = .unspecified
    var streamId: UInt32 = 0
    var sequence: UInt32 = 0

    // MESSAGE fields
    var payload: Data?

    // Common metadata
    var metadata: [String: String]?
    var flags: UInt32 = 0

    // HANDSHAKE fields
    var protocolVersion: UInt32?
    var capabilities: [String]?
    var implementationId: String?

    // OPEN fields
    var method: String?
    var deadlineMs: UInt64?
    var methodType: MethodType?

    // ERROR fields
    var errorCode: UInt32?
    var errorMessage: String?
    var errorDetails: Data?

    // REQUEST_N fields
    var requestN: UInt32?

    // CLOSE fields
    var trailers: [String: String]?

    // Extension point
    var extensions: [String: Data]?
}

// MARK: - Field Numbers

/// Field numbers matching frame.proto exactly. These must stay in sync
/// with the proto definition to maintain wire compatibility.
private enum FieldNumber {
    static let type: Int = 1
    static let streamId: Int = 2
    static let sequence: Int = 3
    static let payload: Int = 4
    static let metadata: Int = 5
    static let flags: Int = 6
    static let protocolVersion: Int = 10
    static let capabilities: Int = 11
    static let implementationId: Int = 12
    static let method: Int = 15
    static let deadlineMs: Int = 16
    static let methodType: Int = 17
    static let errorCode: Int = 20
    static let errorMessage: Int = 21
    static let errorDetails: Int = 22
    static let requestN: Int = 25
    static let trailers: Int = 30
    static let extensions: Int = 100
}

// MARK: - ProtoWriter

/// Low-level protobuf writer that produces wire-format-compatible binary data.
/// Wire-compatible with the TypeScript ProtoWriter in @rpc-bridge/core.
struct ProtoWriter {
    private var data = Data()

    init() {}

    // MARK: Field Writers

    /// Write a varint field (tag + varint value).
    mutating func writeVarintField(fieldNumber: Int, value: UInt64) {
        writeTag(fieldNumber: fieldNumber, wireType: 0)
        writeVarint(value)
    }

    /// Write a bytes field (tag + length-delimited data).
    mutating func writeBytesField(fieldNumber: Int, value: Data) {
        writeTag(fieldNumber: fieldNumber, wireType: 2)
        writeVarint(UInt64(value.count))
        data.append(value)
    }

    /// Write a string field (tag + length-delimited UTF-8 bytes).
    mutating func writeStringField(fieldNumber: Int, value: String) {
        let encoded = Data(value.utf8)
        writeBytesField(fieldNumber: fieldNumber, value: encoded)
    }

    /// Write a length-delimited field with pre-serialized data.
    mutating func writeLengthDelimitedField(fieldNumber: Int, value: Data) {
        writeTag(fieldNumber: fieldNumber, wireType: 2)
        writeVarint(UInt64(value.count))
        data.append(value)
    }

    // MARK: Primitives

    /// Write a field tag (field number + wire type).
    mutating func writeTag(fieldNumber: Int, wireType: Int) {
        writeVarint(UInt64((fieldNumber << 3) | wireType))
    }

    /// Write a varint using LEB128 encoding.
    /// This is compatible with the TypeScript implementation which uses
    /// the same encoding scheme (7 bits per byte, MSB as continuation flag).
    mutating func writeVarint(_ value: UInt64) {
        var v = value
        while v > 0x7F {
            data.append(UInt8((v & 0x7F) | 0x80))
            v >>= 7
        }
        data.append(UInt8(v & 0x7F))
    }

    /// Finalize and return the encoded data.
    func finish() -> Data {
        return data
    }
}

// MARK: - Proto Decoding Errors

/// Errors thrown when decoding malformed protobuf data.
/// Using throwing errors instead of fatalError prevents malformed web
/// content from crashing the host application.
enum ProtoDecodingError: Error, CustomStringConvertible {
    case varintTooLong
    case unexpectedEndOfData(String)
    case unknownWireType(UInt64)

    var description: String {
        switch self {
        case .varintTooLong:
            return "Varint exceeds maximum length (> 10 bytes)"
        case .unexpectedEndOfData(let context):
            return "Unexpected end of data \(context)"
        case .unknownWireType(let wt):
            return "Unknown wire type: \(wt)"
        }
    }
}

// MARK: - ProtoReader

/// Low-level protobuf reader that parses wire-format-compatible binary data.
/// Wire-compatible with the TypeScript ProtoReader in @rpc-bridge/core.
/// All reading methods throw ProtoDecodingError on malformed input instead
/// of calling fatalError, so that malformed data from web content cannot
/// crash the app.
struct ProtoReader {
    private let data: Data
    private var offset: Int = 0

    init(data: Data) {
        self.data = data
    }

    /// Whether there is more data to read.
    func hasMore() -> Bool {
        return offset < data.count
    }

    /// Read a field tag (varint encoding of field number + wire type).
    mutating func readTag() throws -> UInt64 {
        return try readVarint()
    }

    /// Read a varint using LEB128 decoding.
    /// Handles values up to 64 bits, matching the TypeScript implementation.
    mutating func readVarint() throws -> UInt64 {
        var result: UInt64 = 0
        var shift: UInt64 = 0
        while offset < data.count {
            let byte = data[data.startIndex.advanced(by: offset)]
            offset += 1
            result |= UInt64(byte & 0x7F) << shift
            if (byte & 0x80) == 0 {
                return result
            }
            shift += 7
            if shift > 63 {
                throw ProtoDecodingError.varintTooLong
            }
        }
        throw ProtoDecodingError.unexpectedEndOfData("reading varint")
    }

    /// Read a length-delimited byte sequence.
    mutating func readBytes() throws -> Data {
        let length = Int(try readVarint())
        guard offset + length <= data.count else {
            throw ProtoDecodingError.unexpectedEndOfData("reading bytes (need \(length), have \(data.count - offset))")
        }
        let start = data.startIndex.advanced(by: offset)
        let end = start.advanced(by: length)
        let result = data[start..<end]
        offset += length
        return Data(result)
    }

    /// Read a length-delimited UTF-8 string.
    mutating func readString() throws -> String {
        let bytes = try readBytes()
        return String(data: bytes, encoding: .utf8) ?? ""
    }

    /// Skip an unknown field based on its wire type.
    /// This enables forward compatibility: unknown fields are silently ignored.
    mutating func skipField(wireType: UInt64) throws {
        switch wireType {
        case WireType.varint:
            _ = try readVarint()
        case WireType.fixed64:
            guard offset + 8 <= data.count else {
                throw ProtoDecodingError.unexpectedEndOfData("skipping fixed64")
            }
            offset += 8
        case WireType.lengthDelimited:
            _ = try readBytes()
        case WireType.fixed32:
            guard offset + 4 <= data.count else {
                throw ProtoDecodingError.unexpectedEndOfData("skipping fixed32")
            }
            offset += 4
        default:
            throw ProtoDecodingError.unknownWireType(wireType)
        }
    }

    /// Create a sub-reader for a length-delimited sub-message.
    mutating func subReader() throws -> ProtoReader {
        let bytes = try readBytes()
        return ProtoReader(data: bytes)
    }
}

// MARK: - RpcFrame Encoding

extension RpcFrame {

    /// Encode this frame to protobuf wire format.
    /// The encoding matches the TypeScript encodeFrame() exactly, ensuring
    /// wire compatibility between Swift and TypeScript implementations.
    func encode() -> Data {
        var writer = ProtoWriter()

        // Core fields (only written if non-default, per proto3 semantics)
        if type != .unspecified {
            writer.writeVarintField(fieldNumber: FieldNumber.type, value: UInt64(type.rawValue))
        }
        if streamId != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.streamId, value: UInt64(streamId))
        }
        if sequence != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.sequence, value: UInt64(sequence))
        }

        // MESSAGE payload
        if let payload, !payload.isEmpty {
            writer.writeBytesField(fieldNumber: FieldNumber.payload, value: payload)
        }

        // Metadata map
        if let metadata {
            writeStringMap(writer: &writer, fieldNumber: FieldNumber.metadata, map: metadata)
        }

        // Flags
        if flags != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.flags, value: UInt64(flags))
        }

        // HANDSHAKE fields
        if let protocolVersion, protocolVersion != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.protocolVersion, value: UInt64(protocolVersion))
        }
        if let capabilities {
            for cap in capabilities {
                writer.writeStringField(fieldNumber: FieldNumber.capabilities, value: cap)
            }
        }
        if let implementationId, !implementationId.isEmpty {
            writer.writeStringField(fieldNumber: FieldNumber.implementationId, value: implementationId)
        }

        // OPEN fields
        if let method, !method.isEmpty {
            writer.writeStringField(fieldNumber: FieldNumber.method, value: method)
        }
        if let deadlineMs, deadlineMs != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.deadlineMs, value: deadlineMs)
        }
        if let methodType, methodType != .unspecified {
            writer.writeVarintField(fieldNumber: FieldNumber.methodType, value: UInt64(methodType.rawValue))
        }

        // ERROR fields
        if let errorCode, errorCode != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.errorCode, value: UInt64(errorCode))
        }
        if let errorMessage, !errorMessage.isEmpty {
            writer.writeStringField(fieldNumber: FieldNumber.errorMessage, value: errorMessage)
        }
        if let errorDetails, !errorDetails.isEmpty {
            writer.writeBytesField(fieldNumber: FieldNumber.errorDetails, value: errorDetails)
        }

        // REQUEST_N fields
        if let requestN, requestN != 0 {
            writer.writeVarintField(fieldNumber: FieldNumber.requestN, value: UInt64(requestN))
        }

        // CLOSE trailers
        if let trailers {
            writeStringMap(writer: &writer, fieldNumber: FieldNumber.trailers, map: trailers)
        }

        // Extensions
        if let extensions {
            for (key, value) in extensions {
                writeBytesMapEntry(writer: &writer, fieldNumber: FieldNumber.extensions, key: key, value: value)
            }
        }

        return writer.finish()
    }

    /// Decode an RpcFrame from protobuf wire format.
    /// Handles unknown fields gracefully for forward compatibility.
    /// Returns a default frame if the data is malformed.
    static func decode(from data: Data) -> RpcFrame {
        do {
            return try decodeThrowing(from: data)
        } catch {
            // Return a default frame for malformed data rather than crashing
            return RpcFrame()
        }
    }

    /// Throwing variant of decode for callers that want to handle errors.
    static func decodeThrowing(from data: Data) throws -> RpcFrame {
        var reader = ProtoReader(data: data)
        var frame = RpcFrame()

        while reader.hasMore() {
            let tag = try reader.readTag()
            let fieldNumber = Int(tag >> 3)
            let wireType = tag & 0x7

            switch fieldNumber {
            case FieldNumber.type:
                let rawValue = UInt32(try reader.readVarint())
                frame.type = FrameType(rawValue: rawValue) ?? .unspecified

            case FieldNumber.streamId:
                frame.streamId = UInt32(try reader.readVarint())

            case FieldNumber.sequence:
                frame.sequence = UInt32(try reader.readVarint())

            case FieldNumber.payload:
                frame.payload = try reader.readBytes()

            case FieldNumber.metadata:
                if frame.metadata == nil { frame.metadata = [:] }
                let (k, v) = try readStringMapEntry(reader: &reader)
                frame.metadata?[k] = v

            case FieldNumber.flags:
                frame.flags = UInt32(try reader.readVarint())

            case FieldNumber.protocolVersion:
                frame.protocolVersion = UInt32(try reader.readVarint())

            case FieldNumber.capabilities:
                if frame.capabilities == nil { frame.capabilities = [] }
                frame.capabilities?.append(try reader.readString())

            case FieldNumber.implementationId:
                frame.implementationId = try reader.readString()

            case FieldNumber.method:
                frame.method = try reader.readString()

            case FieldNumber.deadlineMs:
                frame.deadlineMs = try reader.readVarint()

            case FieldNumber.methodType:
                let rawValue = UInt32(try reader.readVarint())
                frame.methodType = MethodType(rawValue: rawValue) ?? .unspecified

            case FieldNumber.errorCode:
                frame.errorCode = UInt32(try reader.readVarint())

            case FieldNumber.errorMessage:
                frame.errorMessage = try reader.readString()

            case FieldNumber.errorDetails:
                frame.errorDetails = try reader.readBytes()

            case FieldNumber.requestN:
                frame.requestN = UInt32(try reader.readVarint())

            case FieldNumber.trailers:
                if frame.trailers == nil { frame.trailers = [:] }
                let (k, v) = try readStringMapEntry(reader: &reader)
                frame.trailers?[k] = v

            case FieldNumber.extensions:
                if frame.extensions == nil { frame.extensions = [:] }
                let (k, v) = try readBytesMapEntry(reader: &reader)
                frame.extensions?[k] = v

            default:
                // Unknown field: skip for forward compatibility.
                // This allows newer protocol versions to add fields
                // without breaking older implementations.
                try reader.skipField(wireType: wireType)
            }
        }

        return frame
    }
}

// MARK: - Map Encoding/Decoding Helpers

/// Encode a string-string map as repeated length-delimited sub-messages.
/// Each entry is a sub-message with field 1 = key, field 2 = value.
/// This matches protobuf's map<string, string> wire format.
private func writeStringMap(writer: inout ProtoWriter, fieldNumber: Int, map: [String: String]) {
    for (key, value) in map {
        var entryWriter = ProtoWriter()
        entryWriter.writeStringField(fieldNumber: 1, value: key)
        entryWriter.writeStringField(fieldNumber: 2, value: value)
        writer.writeLengthDelimitedField(fieldNumber: fieldNumber, value: entryWriter.finish())
    }
}

/// Decode a single string-string map entry from a length-delimited sub-message.
private func readStringMapEntry(reader: inout ProtoReader) throws -> (String, String) {
    var sub = try reader.subReader()
    var key = ""
    var value = ""
    while sub.hasMore() {
        let tag = try sub.readTag()
        let field = Int(tag >> 3)
        if field == 1 {
            key = try sub.readString()
        } else if field == 2 {
            value = try sub.readString()
        } else {
            try sub.skipField(wireType: tag & 0x7)
        }
    }
    return (key, value)
}

/// Encode a single string-bytes map entry as a length-delimited sub-message.
private func writeBytesMapEntry(writer: inout ProtoWriter, fieldNumber: Int, key: String, value: Data) {
    var entryWriter = ProtoWriter()
    entryWriter.writeStringField(fieldNumber: 1, value: key)
    entryWriter.writeBytesField(fieldNumber: 2, value: value)
    writer.writeLengthDelimitedField(fieldNumber: fieldNumber, value: entryWriter.finish())
}

/// Decode a single string-bytes map entry from a length-delimited sub-message.
private func readBytesMapEntry(reader: inout ProtoReader) throws -> (String, Data) {
    var sub = try reader.subReader()
    var key = ""
    var value = Data()
    while sub.hasMore() {
        let tag = try sub.readTag()
        let field = Int(tag >> 3)
        if field == 1 {
            key = try sub.readString()
        } else if field == 2 {
            value = try sub.readBytes()
        } else {
            try sub.skipField(wireType: tag & 0x7)
        }
    }
    return (key, value)
}

// MARK: - Base64 Helpers

/// Encode binary data to a base64 string for transport over WKWebView.
/// Uses Foundation's built-in base64 encoding which is compatible with
/// the JavaScript btoa()/atob() functions used on the web side.
func dataToBase64(_ data: Data) -> String {
    return data.base64EncodedString()
}

/// Decode a base64 string to binary data.
/// Returns nil if the input is not valid base64.
func base64ToData(_ base64: String) -> Data? {
    return Data(base64Encoded: base64)
}

// MARK: - Frame Factory Functions

/// Create a HANDSHAKE frame for protocol version negotiation.
/// stream_id must be 0 for handshake frames per the protocol spec.
func createHandshakeFrame(
    protocolVersion: UInt32,
    capabilities: [String],
    implementationId: String
) -> RpcFrame {
    return RpcFrame(
        type: .handshake,
        streamId: 0,
        sequence: 0,
        protocolVersion: protocolVersion,
        capabilities: capabilities,
        implementationId: implementationId
    )
}

/// Create a MESSAGE frame carrying a protobuf-encoded payload.
func createMessageFrame(streamId: UInt32, sequence: UInt32, payload: Data) -> RpcFrame {
    return RpcFrame(
        type: .message,
        streamId: streamId,
        sequence: sequence,
        payload: payload
    )
}

/// Create a HALF_CLOSE frame signaling no more messages from this side.
func createHalfCloseFrame(streamId: UInt32) -> RpcFrame {
    return RpcFrame(
        type: .halfClose,
        streamId: streamId,
        sequence: 0
    )
}

/// Create a CLOSE frame signaling successful stream completion.
func createCloseFrame(streamId: UInt32, trailers: [String: String]? = nil) -> RpcFrame {
    return RpcFrame(
        type: .close,
        streamId: streamId,
        sequence: 0,
        trailers: trailers
    )
}

/// Create an ERROR frame signaling a stream-level error.
func createErrorFrame(
    streamId: UInt32,
    errorCode: UInt32,
    errorMessage: String,
    errorDetails: Data? = nil
) -> RpcFrame {
    return RpcFrame(
        type: .error,
        streamId: streamId,
        sequence: 0,
        errorCode: errorCode,
        errorMessage: errorMessage,
        errorDetails: errorDetails
    )
}

/// Create a REQUEST_N frame granting the peer N additional send credits.
func createRequestNFrame(streamId: UInt32, n: UInt32) -> RpcFrame {
    return RpcFrame(
        type: .requestN,
        streamId: streamId,
        sequence: 0,
        requestN: n
    )
}

// MARK: - RPC Status Codes

/// Status codes modeled after gRPC for familiarity.
/// Numeric values match gRPC status codes where applicable.
enum RpcStatusCode {
    static let ok: UInt32 = 0
    static let cancelled: UInt32 = 1
    static let unknown: UInt32 = 2
    static let invalidArgument: UInt32 = 3
    static let deadlineExceeded: UInt32 = 4
    static let notFound: UInt32 = 5
    static let unimplemented: UInt32 = 12
    static let `internal`: UInt32 = 13
    static let unavailable: UInt32 = 14
}

// MARK: - Demo Message Types

/// HelloRequest message matching proto/demo/hello/v1/hello.proto.
struct HelloRequest: Sendable {
    var name: String = ""
    var language: String = ""

    func encode() -> Data {
        var writer = ProtoWriter()
        if !name.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: name)
        }
        if !language.isEmpty {
            writer.writeStringField(fieldNumber: 2, value: language)
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> HelloRequest {
        var reader = ProtoReader(data: data)
        var msg = HelloRequest()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.name = try reader.readString()
                case 2: msg.language = try reader.readString()
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}

/// HelloResponse message matching proto/demo/hello/v1/hello.proto.
struct HelloResponse: Sendable {
    var message: String = ""
    var timestamp: UInt64 = 0
    var serverVersion: String = ""

    func encode() -> Data {
        var writer = ProtoWriter()
        if !message.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: message)
        }
        if timestamp != 0 {
            writer.writeVarintField(fieldNumber: 2, value: timestamp)
        }
        if !serverVersion.isEmpty {
            writer.writeStringField(fieldNumber: 3, value: serverVersion)
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> HelloResponse {
        var reader = ProtoReader(data: data)
        var msg = HelloResponse()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.message = try reader.readString()
                case 2: msg.timestamp = try reader.readVarint()
                case 3: msg.serverVersion = try reader.readString()
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}

/// GreetingStreamRequest matching proto/demo/hello/v1/hello.proto.
struct GreetingStreamRequest: Sendable {
    var name: String = ""
    var maxCount: UInt32 = 0
    var intervalMs: UInt32 = 0

    func encode() -> Data {
        var writer = ProtoWriter()
        if !name.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: name)
        }
        if maxCount != 0 {
            writer.writeVarintField(fieldNumber: 2, value: UInt64(maxCount))
        }
        if intervalMs != 0 {
            writer.writeVarintField(fieldNumber: 3, value: UInt64(intervalMs))
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> GreetingStreamRequest {
        var reader = ProtoReader(data: data)
        var msg = GreetingStreamRequest()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.name = try reader.readString()
                case 2: msg.maxCount = UInt32(try reader.readVarint())
                case 3: msg.intervalMs = UInt32(try reader.readVarint())
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}

/// GreetingEvent matching proto/demo/hello/v1/hello.proto.
struct GreetingEvent: Sendable {
    var message: String = ""
    var seq: UInt64 = 0
    var timestamp: UInt64 = 0

    func encode() -> Data {
        var writer = ProtoWriter()
        if !message.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: message)
        }
        if seq != 0 {
            writer.writeVarintField(fieldNumber: 2, value: seq)
        }
        if timestamp != 0 {
            writer.writeVarintField(fieldNumber: 3, value: timestamp)
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> GreetingEvent {
        var reader = ProtoReader(data: data)
        var msg = GreetingEvent()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.message = try reader.readString()
                case 2: msg.seq = try reader.readVarint()
                case 3: msg.timestamp = try reader.readVarint()
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}

/// ChatMessage matching proto/demo/hello/v1/hello.proto.
struct ChatMessage: Sendable {
    var from: String = ""
    var text: String = ""
    var seq: UInt64 = 0
    var timestamp: UInt64 = 0

    func encode() -> Data {
        var writer = ProtoWriter()
        if !from.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: from)
        }
        if !text.isEmpty {
            writer.writeStringField(fieldNumber: 2, value: text)
        }
        if seq != 0 {
            writer.writeVarintField(fieldNumber: 3, value: seq)
        }
        if timestamp != 0 {
            writer.writeVarintField(fieldNumber: 4, value: timestamp)
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> ChatMessage {
        var reader = ProtoReader(data: data)
        var msg = ChatMessage()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.from = try reader.readString()
                case 2: msg.text = try reader.readString()
                case 3: msg.seq = try reader.readVarint()
                case 4: msg.timestamp = try reader.readVarint()
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}

/// CollectNamesRequest matching proto/demo/hello/v1/hello.proto.
struct CollectNamesRequest: Sendable {
    var name: String = ""

    func encode() -> Data {
        var writer = ProtoWriter()
        if !name.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: name)
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> CollectNamesRequest {
        var reader = ProtoReader(data: data)
        var msg = CollectNamesRequest()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.name = try reader.readString()
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}

/// CollectNamesResponse matching proto/demo/hello/v1/hello.proto.
struct CollectNamesResponse: Sendable {
    var message: String = ""
    var count: UInt32 = 0

    func encode() -> Data {
        var writer = ProtoWriter()
        if !message.isEmpty {
            writer.writeStringField(fieldNumber: 1, value: message)
        }
        if count != 0 {
            writer.writeVarintField(fieldNumber: 2, value: UInt64(count))
        }
        return writer.finish()
    }

    static func decode(from data: Data) -> CollectNamesResponse {
        var reader = ProtoReader(data: data)
        var msg = CollectNamesResponse()
        do {
            while reader.hasMore() {
                let tag = try reader.readTag()
                let fieldNumber = Int(tag >> 3)
                let wireType = tag & 0x7
                switch fieldNumber {
                case 1: msg.message = try reader.readString()
                case 2: msg.count = UInt32(try reader.readVarint())
                default: try reader.skipField(wireType: wireType)
                }
            }
        } catch { /* return partially decoded message */ }
        return msg
    }
}
