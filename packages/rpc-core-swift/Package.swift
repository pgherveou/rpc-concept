// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "RpcBridge",
    platforms: [
        .iOS(.v16),
        .macOS(.v12),
    ],
    products: [
        .library(name: "RpcBridge", targets: ["RpcBridge"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-protobuf.git", from: "1.28.0"),
    ],
    targets: [
        .target(
            name: "RpcBridge",
            dependencies: [
                .product(name: "SwiftProtobuf", package: "swift-protobuf"),
            ],
            path: "Sources/RpcBridge"
        ),
    ]
)
