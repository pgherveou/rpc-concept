// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift Package Manager
// required to build this package.

import PackageDescription

let package = Package(
    name: "RPCBridgeDemo",
    platforms: [
        .iOS(.v16),
    ],
    targets: [
        .executableTarget(
            name: "RPCBridgeDemo",
            path: "RPCBridgeDemo/Sources"
        ),
    ]
)
