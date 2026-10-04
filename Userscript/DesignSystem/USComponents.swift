import SwiftUI

// MARK: - 🧱 USCard: Apple-Style Surface Container (Section 35, 49, 50)
public struct USCard<Content: View>: View {
    private let content: Content
    private let padding: CGFloat

    public init(padding: CGFloat = USSpacing.l, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: USSpacing.s) {
            content
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(USColor.secondarySurface)
        .cornerRadius(USRadius.large)
        .overlay(
            RoundedRectangle(cornerRadius: USRadius.large)
                .stroke(USColor.separator.opacity(0.4), lineWidth: 0.8)
        )
    }
}

// MARK: - 🔘 USButton: Standardized Apple-Style Button (Section 35)
public struct USButton: View {
    public enum Style {
        case primary
        case secondary
        case subtle
        case destructive
    }

    private let title: String
    private let icon: String?
    private let style: Style
    private let action: () -> Void

    public init(_ title: String, icon: String? = nil, style: Style = .secondary, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.style = style
        self.action = action
    }

    public var body: some View {
        Button(action: {
            USHaptics.tap()
            action()
        }) {
            HStack(spacing: USSpacing.s) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.subheadline.bold())
                }
                Text(title)
                    .font(.subheadline.bold())
            }
            .padding(.horizontal, USSpacing.m)
            .padding(.vertical, USSpacing.s + 1)
            .frame(minHeight: 36)
            .foregroundColor(foregroundColor)
            .background(backgroundColor)
            .cornerRadius(USRadius.medium)
        }
        .buttonStyle(.plain)
    }

    private var foregroundColor: Color {
        switch style {
        case .primary: return .white
        case .secondary: return .primary
        case .subtle: return .secondary
        case .destructive: return .white
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .primary: return USColor.safariBlue
        case .secondary: return USColor.secondarySurface
        case .subtle: return Color.clear
        case .destructive: return USColor.error
        }
    }
}

// MARK: - 🏷️ USBadge: Status Pill / Capsule (Section 37)
public struct USBadge: View {
    public enum Variant {
        case active
        case disabled
        case warning
        case error
        case info
        case neutral
        case custom(Color, String)
    }

    private let text: String
    private let variant: Variant
    private let icon: String?

    public init(_ text: String, variant: Variant = .neutral, icon: String? = nil) {
        self.text = text
        self.variant = variant
        self.icon = icon
    }

    public var body: some View {
        HStack(spacing: 4) {
            if let iconName = icon {
                Image(systemName: iconName)
                    .font(.system(size: 10, weight: .bold))
            }
            Text(text)
                .font(.system(size: 11, weight: .semibold))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(badgeColor.opacity(0.15))
        .foregroundColor(badgeColor)
        .cornerRadius(USRadius.small)
    }

    private var badgeColor: Color {
        switch variant {
        case .active: return USColor.success
        case .disabled: return USColor.neutral
        case .warning: return USColor.warning
        case .error: return USColor.error
        case .info: return USColor.safariBlue
        case .neutral: return .secondary
        case .custom(let color, _): return color
        }
    }
}

// MARK: - 🎛️ USChip: Interactive Filter Chip (Section 8, 35)
public struct USChip: View {
    private let title: String
    private let isSelected: Bool
    private let count: Int?
    private let action: () -> Void

    public init(_ title: String, isSelected: Bool, count: Int? = nil, action: @escaping () -> Void) {
        self.title = title
        self.isSelected = isSelected
        self.count = count
        self.action = action
    }

    public var body: some View {
        Button(action: {
            USHaptics.tap()
            action()
        }) {
            HStack(spacing: USSpacing.xs) {
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .bold : .medium))
                if let count = count {
                    Text("\(count)")
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(isSelected ? Color.white.opacity(0.25) : Color.secondary.opacity(0.2))
                        .cornerRadius(10)
                }
            }
            .padding(.horizontal, USSpacing.m)
            .padding(.vertical, 7)
            .background(isSelected ? USColor.safariBlue : USColor.secondarySurface)
            .foregroundColor(isSelected ? .white : .primary)
            .cornerRadius(USRadius.medium)
            .overlay(
                RoundedRectangle(cornerRadius: USRadius.medium)
                    .stroke(isSelected ? Color.clear : USColor.separator.opacity(0.5), lineWidth: 0.6)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 📑 USSectionHeader: Minimal Section Title (Section 35)
public struct USSectionHeader: View {
    private let title: String
    private let subtitle: String?
    private let actionTitle: String?
    private let action: (() -> Void)?

    public init(_ title: String, subtitle: String? = nil, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(.primary)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            if let actionTitle = actionTitle, let action = action {
                Button(action: {
                    USHaptics.tap()
                    action()
                }) {
                    Text(actionTitle)
                        .font(.subheadline.bold())
                        .foregroundColor(USColor.safariBlue)
                }
            }
        }
        .padding(.vertical, USSpacing.xs)
    }
}

// MARK: - 🔎 USSearchField: Instant & Fuzzy Search Bar (Section 7, 35)
public struct USSearchField: View {
    @Binding private var text: String
    private let placeholder: String

    public init(_ placeholder: String = "Search scripts, domains, tags...", text: Binding<String>) {
        self._text = text
        self.placeholder = placeholder
    }

    public var body: some View {
        HStack(spacing: USSpacing.s) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
                .font(.system(size: 15))
            TextField(placeholder, text: $text)
                .font(.system(size: 15))
                .textFieldStyle(.plain)
            if !text.isEmpty {
                Button(action: {
                    text = ""
                    USHaptics.tap()
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                        .font(.system(size: 14))
                }
            }
        }
        .padding(.horizontal, USSpacing.m)
        .padding(.vertical, 10)
        .background(USColor.secondarySurface)
        .cornerRadius(USRadius.medium)
        .overlay(
            RoundedRectangle(cornerRadius: USRadius.medium)
                .stroke(USColor.separator.opacity(0.4), lineWidth: 0.8)
        )
    }
}

// MARK: - 📊 USMetric: High-Density Apple Stat Box (Section 5, 26, 35)
public struct USMetric: View {
    private let title: String
    private let value: String
    private let icon: String
    private let color: Color

    public init(title: String, value: String, icon: String, color: Color) {
        self.title = title
        self.value = value
        self.icon = icon
        self.color = color
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: USSpacing.xs) {
            HStack {
                Image(systemName: icon)
                    .font(.caption.bold())
                    .foregroundColor(color)
                Spacer()
            }
            Text(value)
                .font(.title2.bold())
                .foregroundColor(.primary)
            Text(title)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(USSpacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(USColor.secondarySurface)
        .cornerRadius(USRadius.large)
        .overlay(
            RoundedRectangle(cornerRadius: USRadius.large)
                .stroke(USColor.separator.opacity(0.4), lineWidth: 0.8)
        )
    }
}

// MARK: - 📭 USEmptyState: Clean & Actionable (Section 40)
public struct USEmptyState: View {
    private let icon: String
    private let title: String
    private let message: String
    private let actionTitle: String?
    private let action: (() -> Void)?

    public init(icon: String, title: String, message: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.icon = icon
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: USSpacing.m) {
            Image(systemName: icon)
                .font(.system(size: 44, weight: .light))
                .foregroundColor(.secondary.opacity(0.7))
                .padding(.bottom, USSpacing.xs)
            Text(title)
                .font(.title3.bold())
                .foregroundColor(.primary)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, USSpacing.xl)
            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.headline)
                        .padding(.horizontal, USSpacing.xl)
                        .padding(.vertical, USSpacing.m)
                        .background(USColor.safariBlue)
                        .foregroundColor(.white)
                        .cornerRadius(USRadius.medium)
                }
                .padding(.top, USSpacing.s)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, USSpacing.xxl)
    }
}

// MARK: - 🔔 USToast: Lightweight Transient Notification (Section 43)
public struct USToast: View {
    private let message: String
    private let icon: String
    private let color: Color

    public init(_ message: String, icon: String = "checkmark.circle.fill", color: Color = USColor.success) {
        self.message = message
        self.icon = icon
        self.color = color
    }

    public var body: some View {
        HStack(spacing: USSpacing.s) {
            Image(systemName: icon)
                .foregroundColor(color)
                .font(.subheadline.bold())
            Text(message)
                .font(.subheadline.bold())
                .foregroundColor(.primary)
        }
        .padding(.horizontal, USSpacing.l)
        .padding(.vertical, USSpacing.m)
        .background(
            #if os(iOS)
            Color(UIColor.secondarySystemBackground)
            #else
            Color(NSColor.windowBackgroundColor)
            #endif
        )
        .cornerRadius(USRadius.xLarge)
        .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 4)
    }
}
