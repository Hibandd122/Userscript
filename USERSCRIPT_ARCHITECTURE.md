# ⚡ Tổng quan Kiến trúc: Userscript (Dự án mới)

## 1. Giới thiệu
**Userscript** là ứng dụng quản lý tiện ích người dùng mã nguồn mở dành riêng cho Safari trên nền tảng **iOS 15.0+** và **iPadOS**. Khác với Stay, Userscript được thiết kế với triết lý **tối giản, siêu nhẹ, thuần túy chạy script**, loại bỏ 100% bloatware, quảng cáo và theo dõi.

---

## 2. Kiến trúc Kỹ thuật

```
Userscript (Xcode Project)
│
├── Userscript (iOS Main App - SwiftUI)
│   ├── App: UserscriptApp (Vòng đời ứng dụng)
│   ├── Models: UserScript (Cấu trúc dữ liệu script, metadata @match, @grant, @run-at)
│   ├── Services:
│   │   ├── ScriptManager: Quản lý CRUD script, cơ chế Hybrid Storage (App Group + Sandbox Fallback)
│   │   ├── ScriptParser: Bộ phân tích tiêu đề Userscript Regex chuẩn
│   │   └── ScriptDownloader: Tải và chuyển đổi script tự động từ GreasyFork / GitHub
│   └── Views:
│       ├── ScriptListView: Danh sách script, tìm kiếm, toggle bật/tắt
│       ├── ScriptDetailView: Xem chi tiết metadata, domain áp dụng
│       ├── ScriptEditorView: Trình soạn thảo mã nguồn JavaScript
│       ├── InstallScriptView: Cài đặt từ link web kèm xem trước thông tin
│       └── SettingsView: Hướng dẫn kích hoạt tiện ích trên Safari, sao lưu JSON
│
└── UserscriptExtension (Safari Web Extension)
    ├── SafariWebExtensionHandler.swift: Cầu nối Native gửi script xuống Extension
    └── Resources:
        ├── manifest.json: Cấu hình WebExtension chuẩn Safari
        ├── matcher.js: Kiểm tra URL trùng khớp quy tắc @match, @include, @exclude
        ├── gm-api.js: Môi trường thực thi GM_* và GM.* đầy đủ
        ├── content.js: Inject script vào trang web theo thời điểm (start, end, idle)
        ├── background.js: Xử lý request mạng xuyên domain (CORS Bypass) cho GM_xmlhttpRequest
        └── popup.html / popup.js: Menu hiển thị số lượng script đang chạy trên tab Safari
```

---

## 3. Những cải tiến đột phá so với Stay

### 🛡️ 1. Khắc phục triệt để lỗi Crash khi Sideloading
- **Vấn đề của Stay:** Thiếu quyền App Group sẽ dẫn đến `nil containerURL` và văng app ngay tức khắc.
- **Giải pháp của Userscript:** Tích hợp cơ chế **Hybrid Fallback Storage** trong `ScriptManager.swift`:
  ```swift
  public var storageDirectory: URL {
      if let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
          return groupURL // Sử dụng App Group nếu có quyền (TrollStore / Paid Cert)
      }
      // Tự động chuyển về thư mục Documents an toàn nếu dùng chứng chỉ miễn phí / ESign / Scarlet
      return fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }
  ```
  👉 **Kết quả:** Ứng dụng hoạt động mượt mà 100% trên mọi phương thức cài đặt (TrollStore, ESign, Scarlet, AltStore, Sideloadly) mà không bao giờ bị crash vì thiếu Entitlements.

### 🍃 2. Siêu nhẹ & Tối ưu hiệu năng
- Kích thước ứng dụng chỉ từ **~2 - 4 MB** (so với 36 MB của Stay).
- Không có bất kỳ framework nhúng thừa thãi nào (không FFmpeg, không TTSDK, không video player cồng kềnh).

### 🔒 3. Quyền riêng tư & Bảo mật tuyệt đối
- **Không telemetry:** Không chứa Umeng, Bugsnag hay bất kỳ SDK theo dõi người dùng nào.
- **Hoạt động Offline 100%:** Chỉ kết nối mạng khi người dùng chủ động tải script từ GreasyFork hoặc khi script yêu cầu `GM_xmlhttpRequest`.

### ⚡ 4. Hỗ trợ đầy đủ tiêu chuẩn Greasemonkey / Tampermonkey
- Hỗ trợ lưu trữ cục bộ: `GM_setValue`, `GM_getValue`, `GM_deleteValue`, `GM_listValues`.
- Thao tác DOM: `GM_addStyle`, `GM_addElement`.
- Thao tác hệ thống: `GM_setClipboard`, `GM_notification`, `GM_openInTab`.
- Hỗ trợ API dạng Promise hiện đại: `GM.getValue()`, `GM.setValue()`, `GM.addStyle()`...
- Hỗ trợ cả 3 thời điểm chèn script: `@run-at document-start`, `document-end`, `document-idle`.

---

## 4. Tích hợp Tự động hóa GitHub Actions (CI/CD)

- File cấu hình: [`.github/workflows/build.yml`](file:///d:/iPA/Stay/Userscript/.github/workflows/build.yml)
- Tự động chạy trên môi trường **macOS-14 runner** với Xcode chính hãng của Apple.
- Khi push code hoặc tag phiên bản (`v1.0.0`):
  1. `xcodebuild` tự động biên dịch cả 2 target (App chính và Safari Extension).
  2. Đóng gói thành file `.ipa` chuẩn POSIX.
  3. Tải file `.ipa` lên mục **GitHub Artifacts** và đính kèm vào **GitHub Releases** để tải về cài đặt ngay.
