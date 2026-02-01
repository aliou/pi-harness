// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "AppleFMBridge",
    platforms: [.macOS(.v26)],
    targets: [
        .executableTarget(
            name: "apple-fm-bridge",
            path: "Sources"
        )
    ]
)
