# 🔍 Tổng quan & Phân tích Kỹ thuật: Stay for Safari

## 1. Giới thiệu
**Stay for Safari (Stay²)** là một tiện ích mở rộng đa năng dành cho trình duyệt Safari trên hệ điều hành iOS, iPadOS và macOS. Ứng dụng ban đầu được định vị là công cụ quản lý Userscript, nhưng theo thời gian đã tích hợp thêm nhiều tính năng như trình chặn quảng cáo (AdBlock), trình bắt link đa phương tiện (Video/Media Sniffer), trình phát video, và hệ thống đăng ký tài khoản trả phí (Stay Pro).

---

## 2. Kiến trúc & Thành phần cốt lõi

### A. Cấu trúc Gói ứng dụng (Bundle Structure)
- **Tên nhị phân chính:** `Stay` (~20.4 MB, viết bằng Objective-C & Swift).
- **PlugIns (9 App Extensions):**
  - `Stay Extension.appex`: Tiện ích mở rộng chính chạy trên Safari (Giao diện Vue.js 3, CodeMirror, Userscript Injector, Sniffer).
  - 6 Content Blockers (`Stay Content Basic`, `Custom`, `Privacy`, `Region`, `Subscribe`, `Tag`): Xử lý lọc quảng cáo dựa trên danh sách EasyList.
  - `Stay Action Extension`: Tích hợp menu chia sẻ Safari.
  - `Stay Widget Extension`: Widget ngoài màn hình.
- **Frameworks nhúng (20 Frameworks):**
  - **Media & FFmpeg:** `ffmpegkit`, `libavcodec`, `libavformat`, `libavutil`, `libswresample`, `libswscale`, `TTFFmpeg`.
  - **ByteDance Live Streaming:** `TTSDKCore`, `TTSDKLivePlayerLite`, `TTSDKPlayerCoreLiveLite`, `TTSDKReachability`, `TTSDKStrategyLite`.
  - **Quảng cáo & Mạng:** `CSJAdSDK` (Pangolin SDK của ByteDance/TikTok), `OpenSSL`, `ttboringssl`.

---

## 3. Điểm mạnh (Pros)
1. **Hỗ trợ Userscript phong phú:** Cung cấp đầy đủ các API Greasemonkey/Tampermonkey tiêu chuẩn (`GM_*` và `GM.*`).
2. **Sniffer mạnh mẽ:** Bắt link stream HLS (`.m3u8`), tự động tải phân đoạn `.ts` và ghép thành `.mp4` thông qua FFmpeg.
3. **Cộng đồng lớn:** Hỗ trợ cài đặt trực tiếp từ GreasyFork và kho script riêng `stayfork.app`.

---

## 4. Nhược điểm & Vấn đề tồn đọng (Cons & Critical Issues)

### ⚠️ A. Lỗi Crash nghiêm trọng khi Sideloading (`Stay-*.ips`)
- **Triệu chứng:** Ứng dụng văng ngay khi vừa mở (`EXC_CRASH / SIGABRT`).
- **Nguyên nhân cốt lõi:**
  - Stay thiết kế bắt buộc phải có quyền **App Group** (`group.com.dajiu.stay.pro`) để chia sẻ dữ liệu giữa App và Extension.
  - Trong phương thức `-[STAppGroups groupPath]`, code gọi:
    ```objc
    [[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:@"group.com.dajiu.stay.pro"]
    ```
  - Khi cài đặt qua các chứng chỉ cá nhân / miễn phí (ESign, Scarlet, Sideloadly) mà không có quyền App Group chính chủ, hàm trên trả về `nil`.
  - Stay không có cơ chế fallback, tiếp tục gọi:
    ```objc
    [NSURL fileURLWithPath:nil] // --> Gây Exception NSInvalidArgumentException và Crash lập tức!
    ```

### 🛑 B. Dung lượng nặng & Nhiều Bloatware
- Dung lượng gốc lên tới **~36 MB** do ôm đồm FFmpeg, live stream player và các SDK ngoài.
- Tích hợp mạng quảng cáo ByteDance `CSJAdSDK` hiển thị pop-up và banner trên bản miễn phí.

### 🕵️ C. Thu thập dữ liệu & Telemetry
- Nhúng SDK theo dõi của bên thứ ba:
  - **Umeng (Alibaba):** Thu thập dữ liệu thiết bị, địa chỉ IP, hành vi duyệt web.
  - **Bugsnag:** Theo dõi crash và phiên người dùng.

### 💰 D. Paywall & Hạn chế tính năng (IAP)
- Ép người dùng mua gói Pro (`Stay_Pro_Lifetime`) để mở khóa:
  - Không giới hạn số lượng script chạy đồng thời.
  - Bảng màu Dark Mode chuyên biệt (Eco, Eyecare, Custom).
  - Tải video hàng loạt qua Sniffer.
