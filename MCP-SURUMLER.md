# MCP sunucusu — sürüm geçmişi

StoaBoard'un MCP yüzeyi (`/mcp`) uygulamadan ayrı sürümleniyor. Sürüm
`server/src/routes/mcp.js` içindeki `MCP_VERSION` sabitinde duruyor ve
`initialize` yanıtında `serverInfo.version`, `whoami` yanıtında
`server.version` olarak görünüyor. **Dağıtımın canlıya indiğini anlamanın tek
yolu bu:** uç anahtarsız isteğe her durumda 401 döndüğü için "yeni kod canlıda
mı" sorusu dışarıdan başka türlü cevaplanamıyor. Yüzeyi değiştiren her
commit'te sürüm artırılır ve buraya yazılır.

> **Araç yüzeyi değişen her sürümden sonra yeni sohbet aç.** İstemci araç
> listesini bağlantı başında bir kez çekiyor ve sunucu "liste değişti"
> diyemiyor (durum tutmayan kip, `listChanged` yok). Açık kalan sohbet eski
> listeyle devam eder; araç çağrıları yine canlı sunucuya gider. 11 Eylül
> 2026'da yaşandı: 0.3.0 sonrası eski sohbet yedi, yeni sohbet on araç gördü.

---

## 0.4.0 — 11 Eylül 2026

İlk yazma araçları: on üç araç, üçü yazıyor. `whoami` artık
`server.writable: true` diyor ve `manage_tasks` MCP'de karşılığı olan izin
sayılıyor (`permissions_without_tools`ten çıktı).

### Eklenen araçlar

- **`create_task`** — aktif alandaki bir projede kart açar.
- **`update_task`** — başlık, açıklama, öncelik, tarihler, atananlar.
  Atananlar tam liste değil, `add_assignees` / `remove_assignees` ile: API
  listeyi baştan yazıyor ve tam liste alan bir araç öbür atananları sessizce
  silebilirdi.
- **`move_task`** — kartı aynı projede başka kolona taşır.

### Üç araçta ortak kurallar

- **`workspace_id` zorunlu** ve aktif alanın kimliği olmalı; değilse 409
  `err_mcp_workspace_mismatch`, yanıtta aktif alan. Hiçbir şey yazılmıyor.
- Proje ve görev **aktif alanda değilse** okuma araçlarıyla birebir aynı 404.
- **Kolon slug'ı önceden doğrulanıyor** (`err_mcp_column_not_found`,
  `valid_columns`). API bilinmeyen kolonu sessizce yok sayıyordu: oluşturmada
  ilk kolona açıyor, taşımada hiçbir şey yapmadan 200 dönüyordu.
- API'nin kendi kapıları olduğu gibi geçiyor: `manage_tasks` (403), atananın
  alan üyeliği (400 `err_assignee_not_member`), kolon geçiş kuralı (409
  `err_transition_not_allowed`, `allowed_next`).
- Her başarılı yazma denetim kaydına düşüyor: `mcp.task_created`,
  `mcp.task_updated`, `mcp.task_moved`. Ayrıntıda yalnızca kimlikler, alan
  adları ve atanan slug'ları var; başlık, açıklama gibi içerik yazılmıyor.

### Bilinçli olarak dışarıda

- **Yorum ekleme.** Kart yorumundaki `@bahsetme` bildirimi alıcıyı bütün
  platformda arıyor (TODO); o kapanmadan araç açılmıyor.
- Silme, etiket, alt görev, alan değiştirme.

> **Araç listesi değişti — yeni sohbet aç.**

---

## 0.3.1 — 11 Eylül 2026

Gerçek istemcinin 0.3.0'ı StoaBoard alanında uçtan uca denemesinden çıkan
bulgular. Araç sayısı değişmedi (on), yazma aracı yok, `writable: false`.

### Yanıt biçimi değişiklikleri — istemciler için kırıcı olabilir

- **Kimlik tipi: yüzeydeki bütün `id` ve `*_id` alanları artık metin.**
  Kural tek noktada, `sonuc()` içinde uygulanıyor. Sayıdan metne dönen
  alanlar:
  - `workspace.id` — `whoami` yanıtında ve her yanıttaki bağlamda
  - `workspace_id` — `list_notes` ve `get_note`
  - `columns[].db_id` — `list_columns`
  - `comments_list[].id`, `subtasks_detail[].id` — `get_task`

  Proje, görev ve not kimlikleri zaten metindi. Araç girdileri metin de sayı
  da kabul ettiği için dönen her kimlik geri verilebiliyor. Neden metin, sayı
  değil: yüzeyde metin çoğunluktaydı ve proje/görev kimlikleri 0.2'den beri
  metin; sayıya çekmek en çok kullanılan kimlikleri kırardı.
- **Alan dışı kimlik artık "bulunamadı".** `list_columns`, `list_tasks`,
  `search_tasks` (`project_id` ile), `get_task` ve `get_note`, aktif alanda
  olmayan bir kayıt için var olmayan kayıtla **birebir aynı** 404'ü dönüyor.
  Önceden kullanıcının üye olduğu başka bir alanın verisini 200 ile ve
  üstünde aktif alanın adıyla döndürüyordu.
- **404 mesajları yönlendirme taşıyor** ("Proje bulunamadı — geçerli
  kimlikler için list_projects kullan"). `error` kodları değişmedi.
- **`list_members`: owner'ın `permissions` alanı tam liste.** Önceden `[]`
  dönüyordu; `whoami`'nin owner için döndürdüğüyle artık aynı.
- **`desc` kelime sınırında kesiliyor ve `…` ile bitiyor** (`list_tasks`,
  `search_tasks`). Önceden tam 200 karakterde, kelime ortasından kesiliyordu.
  En fazla 201 karakter. `desc_truncated` davranışı aynı.
- **JSON sıkışık basılıyor** (girinti yok). İçerik aynı; 15 kartlık bir
  listede karakterlerin %29'u boşluktu. Yalnızca metni satır satır ayrıştıran
  bir istemciyi etkiler.

### Eklenen alanlar

- `list_tasks`: her kartta ve yanıt kökünde `project_name` — `search_tasks`
  kartlarıyla aynı şekil.
- `list_columns`: `project_name`.
- `get_task`: `task.project_name`.
- `search_tasks`, `project_id` verildiğinde de `project_name` taşıyor.

### Bilinçli olarak değişmeyenler

- `list_columns` `title` İngilizce, `title_tr` Türkçe kalıyor.
  `server.title_language` yalnızca araç başlıklarının dilidir; veriyi
  etkilemez. Açıklamalar artık bunu söylüyor.
- İsteğe bağlı alanlar (`desc_truncated`, `subtasks`, `truncated`, `warning`,
  `get_task` içindeki `col_is_done`) hâlâ yalnızca doluyken geliyor.
  Açıklamalar "yoksa ne demek" sorusunu cevaplıyor.

### Açıklama değişiklikleri

`list_workspaces` ve `list_projects`: kullanıcı belirli bir alan ya da proje
adı verdiyse ve yanıt onunla uyuşmuyorsa dur. `list_notes`: `preview`in
markdown temizlendikten sonra 240 karakterde kesildiği. `whoami`:
`title_language`in kapsamı.

---

## 0.3.0 — 11 Eylül 2026

Okuma yüzeyi tamamlandı: yediden on araca.

### Yanıt biçimi değişiklikleri — istemciler için kırıcı olabilir

- **`list_tasks` süzgeçsiz çağrıldığında yalnızca AÇIK kartları döndürüyor.**
  Açık = bitmiş işaretli kolonda olmayan kart. Önceden her şeyi döndürüyordu
  ama açıklaması "açık görevler gelir" diyordu. Bitmişler için
  `include_done: true`.
- **`updated_ago` kaldırıldı** (`list_notes`, `get_note`). `updated_at` ile
  birebir aynı değeri taşıyordu.
- **`desc` listede 200 karakterde kırpılıyor**, kırpıldığında
  `desc_truncated: true`. Tamamı `get_task`te.

### Eklenenler

- Araçlar: `list_workspaces`, `list_members`, `search_tasks`.
- Her yanıtta `workspace` bağlamı.
- `col_is_done` (liste ve detay), `include_done` parametresi.
- `whoami`: `permissions_without_tools`, `server { version, writable,
  title_language }`.
- Araç başlıkları iki dilli (`?lang=en` ya da `Accept-Language`).
- `warning` koşulu genişledi: "bitmiş" bilgisi gerektiğinde ve pano onu
  tanımlamamışken çıkıyor.

---

## 0.2.x — 9-10 Eylül 2026

- 0.2.0: okuma araçları — `list_projects`, `list_columns`, `list_tasks`,
  `get_task`, `list_notes`, `get_note`.
- Kimlik girdileri metin de kabul ediyor (`z.coerce`); proje → kolon → görev
  zinciri önceden `expected number, received string` ile kırıktı.
- Gecikme ölçütü kolona bakıyor, `completed_at` damgasına değil.
- 0.2.3: anahtar `X-Auth-Token` başlığından da kabul ediliyor (tarayıcı içi
  bağlayıcı `Authorization` başlığına izin vermiyor).

## 0.1.0 — 9 Eylül 2026

Kimlik iskeleti: `requireMcpToken`, ayrı hız sınırı, tek araç `whoami`.
