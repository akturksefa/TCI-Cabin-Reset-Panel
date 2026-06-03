# TCI Cabin Reset Panel (Avionics Cabin Crew Control Center)

Bu yazılım, uçak içi eğlence (**IFE**) sistemleri, koltuk akıllı kutuları (**SSB / Seat Smart Box**) ve kabin erişim kontrol ünitelerinin (**AMCU / Access & Management Unit Controller**) fiziki ve mantıksal sıfırlama (reset/reboot) süreçlerini uçak içi kabin personeli (Cabin Crew) ve teknik ekipler için merkezileştiren gelişmiş bir **Kabin Avyonik Kontrol Paneli** arayüzüdür.

Arayüz, kabin içi donanımlara SSH tünelleri vasıtasıyla güvenli komut gönderilmesini sağlayan tam yığınlı (Full-Stack) bir ağ yönetim paneli mimarisine sahiptir.

---

## 🛠️ Mimari ve Çalışma Prensibi

Sistem, modern web standartlarında yüksek kararlılık ve gerçek zamanlı geri bildirim odaklı geliştirilmiştir:

1. **İstemci Arayüzü (React & Tailwind CSS):** Kabin haritası üzerinden her sıfırlama işlemini adım adım izleyebilen, animasyonlar içeren, hata/başarı durumlarında otomatik kilitleme (cooldown) mekanizmasına sahip modern kontrol ekranıdır.
2. **Arka Plan Servisi (Express & Node.js):** İstemciden gelen talepleri alır, hedef uçak içi ağ geçidi IP adresine güvenli SSH2 tüneli açar ve ilgili avyonik alt yapı API'lerine güvenli curl istekleri ileterek gerçek avyonik donanımla haberleşir.
3. **Simülasyon Modu (Developer Mode):** Geliştirme veya uçak dışı test ortamlarında SSH bağlantısına alternatif olarak `simulate` parametresiyle anlık test verileri üretebilir.

---

## 🔥 Temel Özellikler (Core Features)

### 💺 1. Seat Soft / Hard Reboot (Koltuk Seviyesi Yeniden Başlatma)
* **Soft Reset:** İlgili koltuktaki ekran uygulamasını veya alt servisleri (SOM vb.) sistem arayüzünü bozmadan güvenli bir şekilde yeniden başlatır.
* **Hard Reset:** Koltuk terminalinin elektriksel gücünü kesip tekrar vererek (hard power cycle) donanımsal sıfırlama sağlar.

### 🔌 2. SSB (Seat Smart Box) Reset (Sıra Bazlı MCU Sıfırlama)
* İlgili koltuk sırasının altında bulunan akıllı kontrol ünitesini (Seat Smart Box MCU) hedef alarak, o sıradaki tüm koltukların genel şebeke yönetim modülünü sıfırlar.

### ✈️ 3. AMCU Full System Reset (Ana Sistem Güç Çevrimi)
* **Kabin Güvenliği (High-Impact Modal):** Yanlışlıkla veya yetkisiz tetiklemeleri önlemek amacıyla "Slide/Kaydırma" mekanizması kaldırılarak yerine **Yüksek Etkili Çift Onay Popup (Master Confirmation Modal)** entegre edilmiştir.
* Sistem, uçaktaki tüm kabin içi Wi-Fi, IFE sunucuları ve ekranların gücünü kesen bu kritik eylemden önce kabin personeline operasyonel etkileri (veri kayıpları ve 6 dakikalık kurtarma süresi) hakkında net uyarı sunar.

### 🚨 4. Gelişmiş Gerçek Zamanlı Bildirim ve Log Entegrasyonu
* **Dynamic Toast Popups:** Tetiklenen herhangi bir işlem sonrası donanımdan dönen başarılı/hatalı yanıtları anında gösterir.
* **Lock Out Cooldown Timer:** Ağ geçidi tarafından uygulanan fiziksel soğuma (cooldown) sürelerini otomatik tespit eder ve arayüzde geri sayım sayacı (**Active Lockout Counter**) şeklinde canlı olarak gösterir.
* **Deep-Link Log Navigasyonu:** Durum bildirim pop-up'ına tıklanıldığı anda, açılır pencere otomatik kapanır ve ekran aşağı kayarak tetiklenen ilgili eylemin **Activity Log** terminalindeki detaylı teknik satırını (curl komutu, SSH hedefi, Milisaniye cinsinden gecikme süresi vb.) otomatik genişletip parlatarak (highlight) odaklar.

### 📑 5. Detaylı Aktivite İzleme Paneli (Terminal & Activity Log)
* Gerçekleştirilen tüm işlemler uçak içi standartlara uygun olarak loglanır.
* Gönderilen ham `curl` CLI kodları, sunucu yanıt gövdeleri, HTTP durum kodları, işlem süresi (Latency / ms) ve SSH hedef kimliği (`username@ip`) anında görüntülenebilir.

---

## ⚙️ Yapılandırma ve Çevre Değişkenleri (Configuration)

Sistemin uçak içi ana ağ geçidine veya laboratuvar test terminaline bağlanabilmesi için aşağıdaki çevre değişkenlerinin `.env` dosyasında tanımlanması gerekir:

```env
# Gateway IP / Domain (Varsayılan: 10.18.225.250)
SSH_HOST=10.18.225.250

# SSH Gateway Kullanıcı Adı (Varsayılan: tcitest)
SSH_USER=tcitest

# SSH Gateway Şifre (Varsayılan: tcitest1.)
SSH_PASS=tcitest1.
```

---

## 🚀 Geliştirme ve Yayına Alma Komutları

Yazılım paket yönetimi ve çalıştırma adımları standart terminal komutları ile yürütülür:

### Geliştirme Ortamı (Development)
Sistem yerel sunucuyu başlatmak ve kod değişikliklerini anlık izlemek için:
```bash
npm run dev
```

### Üretim Derlemesi (Build for Production)
Yüksek performanslı ve optimize edilmiş standalone Node/CJS paketi ve statik varlıkları (`dist/`) derlemek için:
```bash
npm run build
```

### Canlıya Alma (Production Start)
Derlenmiş optimizasyonlu avyonik servisi arka planda başlatmak için:
```bash
npm run start
```

### Kod Denetimi (Linting)
Tip güvenliği ve sözdizimi doğrulaması için:
```bash
npm run lint
```

---

## 🔒 Güvenlik Uyarıları

* Bu yazılım, **TCI Cabin Interior** standartlarına uygun kabin içi yerel ağlarda çalıştırılmak üzere tasarlanmıştır. Public ağlarda doğrudan SSH şifreleri taşınmadığından emin olunmalı, tüm veri akışı yerel VPN veya uçak içi güvenli Wi-Fi (WPA3-Enterprise) üzerinden tünellenmelidir.
* Donanım kilitlenme koruması (Cooldown/Lockout), uçuş anında sunucuların aşırı ısınmasını veya peş peşe gelen isteklerle aşırı yüklenmesini (DDoS durumlarını) önleyen kritik bir güvenlik katmanıdır.
