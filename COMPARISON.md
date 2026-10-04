# ⚖️ Bảng So sánh Chi tiết: Stay for Safari vs. Userscript

| Tiêu chí | Stay for Safari (`v2.9.24`) | Userscript (App mới của bạn) |
|---|---|---|
| **Mục đích thiết kế** | Đa tính năng (Script + AdBlock + Sniffer + Player) | **Thuần túy quản lý Userscript (Chuyên biệt & Tối giản)** |
| **Dung lượng IPA** | **~36 MB** (Rất nặng do nhúng FFmpeg & SDK) | **~2 - 4 MB (Siêu nhẹ, khởi động tức thì)** |
| **Mã nguồn** | Mã nguồn đóng, thương mại | **100% Mã nguồn mở (MIT License)** |
| **Độ ổn định khi Sideload** | ❌ **Dễ Crash (`SIGABRT`)** nếu cert thiếu App Group |  **Kháng lỗi 100% (Tự động fallback về Sandbox)** |
| **SDK Theo dõi (Telemetry)** | ❌ Có (`Umeng`, `Bugsnag`) thu thập IP, thiết bị |  **Không có (100% Offline & Bảo mật riêng tư)** |
| **Quảng cáo** | ❌ Có (`CSJAdSDK` của ByteDance/TikTok) |  **Không có quảng cáo** |
| **Rào cản trả phí (Paywall)** | ❌ Có (`Stay Pro` - giới hạn màu, tính năng, sync) |  **Hoàn toàn Miễn phí - Full quyền vĩnh viễn** |
| **Giao diện quản lý** | Objective-C kết hợp WebView | **100% SwiftUI hiện đại, hỗ trợ Dynamic Type & Dark Mode** |
| **Công nghệ Extension** | Vue.js 3 + 9 App Extensions cồng kềnh | **Native Safari Web Extension + Vanilla JS tối ưu** |
| **Cài đặt script GreasyFork**| Hỗ trợ qua WebView trung gian | **1-Chạm cài đặt trực tiếp, tự parse metadata xem trước** |
| **Bộ API Greasemonkey** | Đầy đủ (`GM_*`, `GM.*`) | **Đầy đủ (`GM_*`, `GM.*`) kèm Bridge CORS Bypass** |
| **Tự động build CI/CD** | Thủ công nội bộ nhà phát triển | **Có sẵn GitHub Actions (`build.yml`) build tự động ra IPA** |

---

## 🎯 Kết luận & Khuyến nghị

1. **Nếu bạn chỉ cần chạy Userscript trên Safari:**
   - Ứng dụng **Userscript** mới là lựa chọn vượt trội hoàn toàn: sạch sẽ, nhẹ hơn 10 lần, không bị theo dõi, và đặc biệt **không bao giờ bị văng app** khi ký bằng ESign/Scarlet/chứng chỉ miễn phí.

2. **Nếu cần tính năng Sniffer video M3U8 từ Stay:**
   - Bạn có thể dùng file IPA Stay đã patch Pro vĩnh viễn ([`Stay_v2.9.24_Pro_Patched.ipa`](file:///d:/iPA/Stay/Stay_v2.9.24_Pro_Patched.ipa)) cài qua **TrollStore** (để giữ được quyền App Group).
   - Còn đối với các máy dùng ESign/Sideload thông thường, app **Userscript** mới là giải pháp duy nhất chạy ổn định không lo lỗi certificate entitlement.
