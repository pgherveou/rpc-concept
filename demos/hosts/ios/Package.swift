// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "RPCBridgeDemo",
    platforms: [
        .iOS(.v16),
    ],
    dependencies: [
        .package(path: "../../../packages/rpc-core-swift"),
    ],
    targets: [
        .executableTarget(
            name: "RPCBridgeDemo",
            dependencies: [
                .product(name: "RpcBridge", package: "rpc-core-swift"),
            ],
            path: "RPCBridgeDemo",
            sources: ["Sources", "generated"],
            resources: [
                .copy("web"),
            ]
        ),
    ]
)
