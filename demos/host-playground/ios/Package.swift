// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "RPCBridgeDemo",
    platforms: [
        .iOS(.v16),
    ],
    targets: [
        .executableTarget(
            name: "RPCBridgeDemo",
            path: "RPCBridgeDemo",
            sources: ["Sources"],
            resources: [
                .copy("web"),
            ]
        ),
    ]
)
