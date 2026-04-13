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
    targets: [
        .target(
            name: "RpcBridge",
            path: "Sources/RpcBridge"
        ),
    ]
)
