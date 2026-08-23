# 🎙️ SESSİZ FREKANS — Silent Frequency

> **Onlar göremez. Ama her şeyi duyarlar.**

Tarayıcıda çalışan, tamamen **vanilla JavaScript + HTML5 Canvas + Web Audio API** ile yazılmış hayatta kalma-korku oyunu. Harici kütüphane yok, framework yok — tek `index.html` açmak yeterli.

![Tür](https://img.shields.io/badge/T%C3%BCr-Korku%20%2F%20Gizlilik-red)
![Motor](https://img.shields.io/badge/Motor-Vanilla%20JS%20%2B%20Canvas-yellow)
![Dil](https://img.shields.io/badge/Dil-T%C3%BCrk%C3%A7e-blue)

## 📖 Hikaye

Gece radyosu sunucusu **Deniz "Gece Kuşu" Aksoy**, canlı yayına düşen parazitli bir çağrıda 7 yıl önce kaybolan kız kardeşi Elif'in sesini duyar: *"87.9'u sakın dinleme..."* Sinyalin izi, ormanın derinliklerindeki terk edilmiş **Kanal-9 Radyolink İstasyonu**'na çıkar — insanları körleştirip kulaklarını canavarlaştıran bir **ses virüsünün** doğduğu yere.

## 🎮 Oynanış

Düşmanlar **tamamen kör** ama sese aşırı duyarlı. Her adımın bir ses çemberi yayar — gizlilik, dikkat dağıtma ve frekans silahları arasında denge kurmalısın.

### Bölümler
1. **Orman** — Açık dünya gizlilik: 3 sigorta bul, radyolarla Dinleyicileri kandır, Ağız'ın titreşim algısından kaç
2. **İstasyonun İçi** — Koridor labirenti: uyuyan Emekleyenler, cam kırığı tuzakları, 3 doğrulama bandı ve 35 saniyelik final kuşatması
3. **Son Yayın** — Kaçış sekansı → **FNAF tarzı güvenlik odası** (animasyonlu çelik kapılar, kamera sistemi, güç yönetimi) → havalandırma fener minigame'i

### Düşmanlar
| Düşman | Özellik | Zayıflık |
|---|---|---|
| **Dinleyici** | Kör, dev kulak çanakları, ekolokasyon | Ses patlaması, çift kaynak karmaşası |
| **Ağız** | Sağır, titreşim hisseder, seni "işaretler" | Saldırı öncesi açılan göğüs zarı |
| **Emekleyen** | Uyur, ses duyunca fırlar | Uyandırmamak, fener |
| **Gölge** | Kapılara sokulur (Bölüm 3) | Çelik kapı veya fener |
| **Seyirci** | Kameralarda gezer, pencereye gelir | Kameraya bakmak |

### Silahlar (hepsi el yapımı, frekans temelli)
- **Rezonans Mızrağı** — sessiz infrasonik yakın dövüş
- **Yankı Küresi** — kayıt-oynat ses tuzağı
- **Sinyal Feneri** — mutantları sersemleten anti-frekans hüzmesi (çok gürültülü!)

## ⌨️ Kontroller

| Tuş | İşlev |
|---|---|
| `W A S D` | Hareket |
| `SHIFT` | Koş (gürültülü, stamina harcar) |
| `C` | Sessiz yürüyüş |
| `Sol Tık` | Rezonans Mızrağı |
| `Q` | Yankı Küresi fırlat |
| `F` (basılı) | Sinyal Feneri |
| `E` | Etkileşim |
| `P` / `ESC` | Menü (Ayarlar + Yönetici Paneli) |

FNAF bölümünde: `A/D` kapılar, `Q/E` fenerle bak, `S` kamera, `W` kamera değiştir.

## 🚀 Çalıştırma

```bash
# Yöntem 1: doğrudan aç
index.html dosyasını tarayıcıda aç

# Yöntem 2: yerel sunucu (önerilen)
python3 -m http.server 8000
# → http://localhost:8000
```

🎧 **Kulaklıkla oynayın.** Tüm sesler (ortam, kalp atışı, jumpscare, Bölüm 3 müziği) Web Audio API ile gerçek zamanlı prosedürel üretilir.

## ✨ Teknik Özellikler

- Ses çemberi yayılım sistemi + zemine göre ses maskeleme
- Durum makineli düşman yapay zekası (devriye/şüphe/kovalama/sersemleme)
- Dinamik karanlık + el feneri konisi (canvas compositing)
- Sinematik post-processing: film greni, renk derecelendirme, vinyet, 3 katmanlı hacimsel sis
- AI üretimi konsept görselleri ve dokular
- Prosedürel müzik ve ses efektleri (sıfır ses dosyası!)
- Ayarlar menüsü (parlaklık/ses/sarsıntı/gren, localStorage kayıtlı)
- Şifreli yönetici paneli (bölüm atlama, ESP, god mode...)

## 📄 Lisans

MIT — dilediğiniz gibi kullanın, geliştirin, paylaşın.

---
*Bir gece yayını sırasında tasarlandı. 87.9'u sakın dinlemeyin.* 📻
