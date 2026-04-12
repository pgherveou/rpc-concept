// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "RPCBridgeDemo",
    platforms: [
        .iOS(.v16),
        .macOS(.v12),
    ],
    dependencies: [
        .package(path: "../../../packages/rpc-core-swift"),
        .package(url: "https://github.com/apple/swift-protobuf.git", from: "1.28.0"),
    ],
    targets: [
        .executableTarget(
            name: "RPCBridgeDemo",
            dependencies: [
                .product(name: "RpcBridge", package: "rpc-core-swift"),
                .product(name: "SwiftProtobuf", package: "swift-protobuf"),
            ],
            path: "RPCBridgeDemo",
            sources: ["Sources", "generated"],
            resources: [
                .copy("web"),
            ]
        ),
    ]
)
