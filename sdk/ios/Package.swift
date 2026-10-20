// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Salsys",
    platforms: [
        .iOS(.v15),
    ],
    products: [
        .library(
            name: "Salsys",
            targets: ["Salsys"]
        ),
    ],
    targets: [
        .target(
            name: "Salsys",
            path: "Sources/Salsys"
        ),
    ]
)
