import SwiftUI

// MARK: - 🎨 USDesignSystem: Design Tokens & Visual Language
// Section 2, 3, 36, 37, 38 Apple Human Interface Guidelines Compliance

public enum USSpacing {
    /// 4 pt
    public static let xs: CGFloat = 4
    /// 8 pt
    public static let s: CGFloat = 8
    /// 12 pt
    public static let m: CGFloat = 12
    /// 16 pt
    public static let l: CGFloat = 16
    /// 24 pt
    public static let xl: CGFloat = 24
    /// 32 pt
    public static let xxl: CGFloat = 32
}

public enum USRadius {
    /// 6 pt - Small pills & badges
    public static let small: CGFloat = 6
    /// 10 pt - Standard buttons, tags, chips
    public static let medium: CGFloat = 10
    /// 14 pt - Cards, list items, hero blocks
    public static let large: CGFloat = 14
    /// 20 pt - Modals, popups, sheets
    public static let xLarge: CGFloat = 20
}

public enum USMotion {
    public static let quickSpring = Animation.spring(response: 0.28, dampingFraction: 0.82)
    public static let smoothSpring = Animation.spring(response: 0.38, dampingFraction: 0.85)
    public static let subtleEase = Animation.easeInOut(duration: 0.2)
}

public enum USColor {
    // Primary brand accents (Apple-native tones)
    public static let accent = Color.accentColor
    public static let safariBlue = Color(red: 0.0, green: 0.48, blue: 1.0)
    public static let purple = Color(red: 0.68, green: 0.32, blue: 0.87)
    public static let teal = Color(red: 0.19, green: 0.69, blue: 0.78)
    
    // Status semantics
    public static let success = Color(red: 0.20, green: 0.78, blue: 0.35)
    public static let warning = Color(red: 1.0, green: 0.58, blue: 0.0)
    public static let error = Color(red: 1.0, green: 0.23, blue: 0.19)
    public static let neutral = Color.secondary

    // Dynamic Apple-native background layers
    public static var surfaceBackground: Color {
        #if os(iOS)
        return Color(UIColor.systemBackground)
        #else
        return Color(NSColor.windowBackgroundColor)
        #endif
    }
    
    public static var secondarySurface: Color {
        #if os(iOS)
        return Color(UIColor.secondarySystemBackground)
        #else
        return Color(NSColor.controlBackgroundColor)
        #endif
    }
    
    public static var tertiarySurface: Color {
        #if os(iOS)
        return Color(UIColor.tertiarySystemBackground)
        #else
        return Color(NSColor.underPageBackgroundColor)
        #endif
    }

    public static var separator: Color {
        #if os(iOS)
        return Color(UIColor.separator)
        #else
        return Color(NSColor.separatorColor)
        #endif
    }
}

// MARK: - Haptic Feedback Utility
public enum USHaptics {
    public static func tap() {
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        #endif
    }

    public static func success() {
        #if os(iOS)
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
        #endif
    }

    public static func warning() {
        #if os(iOS)
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.warning)
        #endif
    }

    public static func error() {
        #if os(iOS)
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
        #endif
    }
}
