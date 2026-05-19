-- ============================================================
-- SEED DATA: Characters Catalog + 16 Starting Participants
-- ============================================================

-- ============================================================
-- CHARACTERS CATALOG (50 characters)
-- ============================================================

INSERT INTO characters (name, slug, source, role_type, access_level, description, avatar_url) VALUES
-- Danganronpa 1
('Макото Наэги', 'makoto-naegi', 'Danganronpa 1', 'hope', 'free', 'Суперстаршеклассник Удачи. Обычный парень с невероятной удачей и несгибаемой верой в людей.', '/avatars/makoto-naegi.png'),
('Кёко Киригири', 'kyoko-kirigiri', 'Danganronpa 1', 'logic', 'free', 'Суперстаршеклассница Детектив. Холодный ум, наблюдательность, скрытность.', '/avatars/kyoko-kirigiri.png'),
('Бьякуя Тогами', 'byakuya-togami', 'Danganronpa 1', 'elite', 'free', 'Суперстаршеклассник Наследник. Высокомерный гений из богатейшей семьи.', '/avatars/byakuya-togami.png'),
('Токо Фукава', 'toko-fukawa', 'Danganronpa 1', 'weak_link', 'free', 'Суперстаршеклассница Писатель. Нестабильная, одержимая Тогами, скрывает тёмное альтер-эго.', '/avatars/toko-fukawa.png'),
('Аой Асахина', 'aoi-asahina', 'Danganronpa 1', 'social', 'free', 'Суперстаршеклассница Пловец. Энергичная, эмоциональная, верная друзьям.', '/avatars/aoi-asahina.png'),
('Ясухиро Хагакуре', 'yasuhiro-hagakure', 'Danganronpa 1', 'weak_link', 'free', 'Суперстаршеклассник Ясновидящий. Трусоватый, но добрый. Точность предсказаний — 30%.', '/avatars/yasuhiro-hagakure.png'),
('Сакура Огами', 'sakura-ogami', 'Danganronpa 1', 'strength', 'free', 'Суперстаршеклассница Боец. Сильнейший человек в мире с кодексом чести.', '/avatars/sakura-ogami.png'),
('Леон Кувата', 'leon-kuwata', 'Danganronpa 1', 'social', 'free', 'Суперстаршеклассник Бейсболист. Импульсивный, хочет быть рок-звездой.', '/avatars/leon-kuwata.png'),
('Саяка Майзоно', 'sayaka-maizono', 'Danganronpa 1', 'social', 'free', 'Суперстаршеклассница Идол. Обаятельная, но способна на манипуляции ради цели.', '/avatars/sayaka-maizono.png'),
('Чихиро Фуджисаки', 'chihiro-fujisaki', 'Danganronpa 1', 'logic', 'free', 'Суперстаршеклассник Программист. Хрупкий, уязвимый, но гениальный ум.', '/avatars/chihiro-fujisaki.png'),
('Мондо Овада', 'mondo-owada', 'Danganronpa 1', 'strength', 'free', 'Суперстаршеклассник Байкер. Вспыльчивый лидер банды с понятием чести.', '/avatars/mondo-owada.png'),
('Киётака Ишимару', 'kiyotaka-ishimaru', 'Danganronpa 1', 'social', 'free', 'Суперстаршеклассник Моральный компас. Фанатичный порядок, правила, дисциплина.', '/avatars/kiyotaka-ishimaru.png'),
('Хифуми Ямада', 'hifumi-yamada', 'Danganronpa 1', 'weak_link', 'free', 'Суперстаршеклассник Фанфик-мастер. Эксцентричный отаку, легко манипулируемый.', '/avatars/hifumi-yamada.png'),
('Селестия Люденберг', 'celestia-ludenberg', 'Danganronpa 1', 'elite', 'gm_only', 'Суперстаршеклассница Азартных игр. Королева лжи и манипуляций. Президент академии.', '/avatars/celestia-ludenberg.png'),
('Джунко Эношима', 'junko-enoshima', 'Danganronpa 1', 'chaos', 'gm_only', 'Суперстаршеклассница Отчаяния. Гений манипуляций, несёт хаос и разрушение.', '/avatars/junko-enoshima.png'),
('Мукуро Икусаба', 'mukuro-ikusaba', 'Danganronpa 1', 'strength', 'gm_only', 'Суперстаршеклассница Солдат. Сестра Джунко, смертельно опасна, но покорна.', '/avatars/mukuro-ikusaba.png'),

-- Danganronpa 2
('Хадзимэ Хината', 'hajime-hinata', 'Danganronpa 2', 'hope', 'free', 'Резервный студент, ищущий талант. Аналитичный, упрямый, лидер по натуре.', '/avatars/hajime-hinata.png'),
('Нагито Комаэда', 'nagito-komaeda', 'Danganronpa 2', 'chaos', 'gm_only', 'Суперстаршеклассник Удачи. Фанатик надежды с извращённой логикой.', '/avatars/nagito-komaeda.png'),
('Чиаки Нанами', 'chiaki-nanami', 'Danganronpa 2', 'logic', 'free', 'Суперстаршеклассница Геймер. Спокойная, добрая, стратегически мыслит.', '/avatars/chiaki-nanami.png'),
('Сония Невермайнд', 'sonia-nevermind', 'Danganronpa 2', 'social', 'free', 'Суперстаршеклассница Принцесса. Аристократка с неожиданными интересами.', '/avatars/sonia-nevermind.png'),
('Кадзуичи Сода', 'kazuichi-soda', 'Danganronpa 2', 'social', 'free', 'Суперстаршеклассник Механик. Трусливый, но верный, одержим Сонией.', '/avatars/kazuichi-soda.png'),
('Фуюхико Кузурю', 'fuyuhiko-kuzuryu', 'Danganronpa 2', 'strength', 'free', 'Суперстаршеклассник Якудза. Маленький, гордый, опасный лидер клана.', '/avatars/fuyuhiko-kuzuryu.png'),
('Пеко Пекояма', 'peko-pekoyama', 'Danganronpa 2', 'strength', 'free', 'Суперстаршеклассница Мечница. Молчаливая и смертоносная, преданна Фуюхико.', '/avatars/peko-pekoyama.png'),
('Микан Цумики', 'mikan-tsumiki', 'Danganronpa 2', 'weak_link', 'free', 'Суперстаршеклассница Медсестра. Неуверенная, жертва буллинга, скрывает тьму.', '/avatars/mikan-tsumiki.png'),
('Ибуки Миода', 'ibuki-mioda', 'Danganronpa 2', 'social', 'free', 'Суперстаршеклассница Музыкант. Хаотичная энергия, громкая и непредсказуемая.', '/avatars/ibuki-mioda.png'),
('Хиёко Сайонджи', 'hiyoko-saionji', 'Danganronpa 2', 'social', 'free', 'Суперстаршеклассница Танцовщица. Жестокая на язык, но ранимая внутри.', '/avatars/hiyoko-saionji.png'),
('Махиру Коидзуми', 'mahiru-koizumi', 'Danganronpa 2', 'social', 'free', 'Суперстаршеклассница Фотограф. Ответственная, строгая, заботливая.', '/avatars/mahiru-koizumi.png'),
('Тэрутэру Ханамура', 'teruteru-hanamura', 'Danganronpa 2', 'weak_link', 'free', 'Суперстаршеклассник Повар. Извращённый, но талантливый кулинар.', '/avatars/teruteru-hanamura.png'),
('Нэкомару Нидай', 'nekomaru-nidai', 'Danganronpa 2', 'strength', 'free', 'Суперстаршеклассник Тренер. Громогласный, сильный, заботится о команде.', '/avatars/nekomaru-nidai.png'),
('Гандам Танака', 'gundham-tanaka', 'Danganronpa 2', 'chaos', 'free', 'Суперстаршеклассник Заводчик. Эксцентричный повелитель тьмы и хомяков.', '/avatars/gundham-tanaka.png'),
('Аканэ Овари', 'akane-owari', 'Danganronpa 2', 'strength', 'free', 'Суперстаршеклассница Гимнаст. Безрассудная, сильная, всегда голодная.', '/avatars/akane-owari.png'),
('Лже-Бьякуя / Самозванец', 'impostor-byakuya', 'Danganronpa 2', 'social', 'gm_only', 'Суперстаршеклассник Самозванец. Добрый лидер, скрывающийся за чужим лицом.', '/avatars/impostor-byakuya.png'),
('Комару Наэги', 'komaru-naegi', 'Ultra Despair Girls', 'hope', 'free', 'Младшая сестра Макото. Обычная девушка, нашедшая силу в отчаянии.', '/avatars/komaru-naegi.png'),

-- Danganronpa V3
('Шуичи Сайхара', 'shuichi-saihara', 'Danganronpa V3', 'logic', 'free', 'Суперстаршеклассник Детектив. Неуверенный, но блестящий аналитик.', '/avatars/shuichi-saihara.png'),
('Каэде Акамацу', 'kaede-akamatsu', 'Danganronpa V3', 'hope', 'free', 'Суперстаршеклассница Пианистка. Оптимистка-лидер, верит в людей.', '/avatars/kaede-akamatsu.png'),
('Кокичи Ома', 'kokichi-oma', 'Danganronpa V3', 'chaos', 'gm_only', 'Суперстаршеклассник Лидер. Патологический лжец, гений манипуляций.', '/avatars/kokichi-oma.png'),
('Маки Харукава', 'maki-harukawa', 'Danganronpa V3', 'strength', 'free', 'Суперстаршеклассница Убийца. Холодная, смертоносная, скрывает нежность.', '/avatars/maki-harukawa.png'),
('Кайто Момота', 'kaito-momota', 'Danganronpa V3', 'hope', 'free', 'Суперстаршеклассник Астронавт. Горячий, смелый, верит в своих друзей.', '/avatars/kaito-momota.png'),
('Рантаро Амами', 'rantaro-amami', 'Danganronpa V3', 'logic', 'free', 'Суперстаршеклассник ???. Загадочный, спокойный, знает больше, чем говорит.', '/avatars/rantaro-amami.png'),
('Химико Юмено', 'himiko-yumeno', 'Danganronpa V3', 'weak_link', 'free', 'Суперстаршеклассница Маг. Ленивая, но талантливая, верит в свою магию.', '/avatars/himiko-yumeno.png'),
('Анджи Ёнага', 'angie-yonaga', 'Danganronpa V3', 'chaos', 'free', 'Суперстаршеклассница Художница. Фанатичная жрица с манипулятивным обаянием.', '/avatars/angie-yonaga.png'),
('Миу Ирума', 'miu-iruma', 'Danganronpa V3', 'logic', 'free', 'Суперстаршеклассница Изобретатель. Гениальная, вульгарная, трусливая.', '/avatars/miu-iruma.png'),
('Гонта Гокухара', 'gonta-gokuhara', 'Danganronpa V3', 'strength', 'free', 'Суперстаршеклассник Энтомолог. Гигант с душой ребёнка, хочет быть джентльменом.', '/avatars/gonta-gokuhara.png'),
('Кируми Тоджо', 'kirumi-tojo', 'Danganronpa V3', 'social', 'free', 'Суперстаршеклассница Горничная. Безупречна, готова на всё ради долга.', '/avatars/kirumi-tojo.png'),
('Тэнко Чабашира', 'tenko-chabashira', 'Danganronpa V3', 'strength', 'free', 'Суперстаршеклассница Айкидо. Воинственная защитница, презирает мужчин.', '/avatars/tenko-chabashira.png'),
('Корэкиё Сингудзи', 'korekiyo-shinguji', 'Danganronpa V3', 'chaos', 'gm_only', 'Суперстаршеклассник Антрополог. Изысканный, жуткий, одержим красотой человечества.', '/avatars/korekiyo-shinguji.png'),
('Рёма Хоси', 'ryoma-hoshi', 'Danganronpa V3', 'weak_link', 'free', 'Суперстаршеклассник Теннисист. Потерял всё, не дорожит жизнью.', '/avatars/ryoma-hoshi.png'),
('Цумуги Широганэ', 'tsumugi-shirogane', 'Danganronpa V3', 'social', 'gm_only', 'Суперстаршеклассница Косплеер. Незаметная, но может быть кукловодом.', '/avatars/tsumugi-shirogane.png'),

-- Special
('Монокума', 'monokuma', 'Danganronpa', 'gm', 'service', 'Директор академии. Робот-медведь, символ отчаяния и игры.', '/avatars/monokuma.png'),
('Мономи', 'monomi', 'Danganronpa 2', 'service', 'service', 'Помощница. Кролик-учитель, символ надежды (и жертва Монокумы).', '/avatars/monomi.png');

-- ============================================================
-- 16 STARTING PARTICIPANTS
-- ============================================================

-- Note: user_id is NULL until real users register and link accounts
-- Participant IDs are deterministic for easy reference

INSERT INTO participants (id, character_id, display_name, balance, status, hope_score, despair_score, madness_score, reputation_score) VALUES
-- 1. Ведущий / Монокума
(
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM characters WHERE slug = 'monokuma'),
  'Монокума (Ведущий)',
  999999,
  'gm',
  0, 100, 100, 100
),
-- 2. Селестия Люденберг
(
  '00000000-0000-0000-0000-000000000002',
  (SELECT id FROM characters WHERE slug = 'celestia-ludenberg'),
  'Селестия Люденберг',
  10000,
  'celestia',
  30, 40, 80, 95
),
-- 3. Макото Наэги
(
  '00000000-0000-0000-0000-000000000003',
  (SELECT id FROM characters WHERE slug = 'makoto-naegi'),
  'Макото Наэги',
  1000,
  'free',
  90, 10, 20, 60
),
-- 4. Кёко Киригири
(
  '00000000-0000-0000-0000-000000000004',
  (SELECT id FROM characters WHERE slug = 'kyoko-kirigiri'),
  'Кёко Киригири',
  1000,
  'free',
  70, 15, 30, 75
),
-- 5. Бьякуя Тогами
(
  '00000000-0000-0000-0000-000000000005',
  (SELECT id FROM characters WHERE slug = 'byakuya-togami'),
  'Бьякуя Тогами',
  1500,
  'free',
  40, 20, 40, 85
),
-- 6. Токо Фукава
(
  '00000000-0000-0000-0000-000000000006',
  (SELECT id FROM characters WHERE slug = 'toko-fukawa'),
  'Токо Фукава',
  1000,
  'free',
  35, 45, 60, 30
),
-- 7. Аой Асахина
(
  '00000000-0000-0000-0000-000000000007',
  (SELECT id FROM characters WHERE slug = 'aoi-asahina'),
  'Аой Асахина',
  1000,
  'free',
  75, 15, 25, 65
),
-- 8. Ясухиро Хагакуре
(
  '00000000-0000-0000-0000-000000000008',
  (SELECT id FROM characters WHERE slug = 'yasuhiro-hagakure'),
  'Ясухиро Хагакуре',
  1000,
  'free',
  50, 20, 35, 40
),
-- 9. Сакура Огами
(
  '00000000-0000-0000-0000-000000000009',
  (SELECT id FROM characters WHERE slug = 'sakura-ogami'),
  'Сакура Огами',
  1000,
  'free',
  80, 10, 15, 80
),
-- 10. Леон Кувата
(
  '00000000-0000-0000-0000-000000000010',
  (SELECT id FROM characters WHERE slug = 'leon-kuwata'),
  'Леон Кувата',
  1000,
  'free',
  55, 25, 45, 50
),
-- 11. Саяка Майзоно
(
  '00000000-0000-0000-0000-000000000011',
  (SELECT id FROM characters WHERE slug = 'sayaka-maizono'),
  'Саяка Майзоно',
  1000,
  'free',
  60, 30, 40, 70
),
-- 12. Чихиро Фуджисаки
(
  '00000000-0000-0000-0000-000000000012',
  (SELECT id FROM characters WHERE slug = 'chihiro-fujisaki'),
  'Чихиро Фуджисаки',
  1000,
  'free',
  70, 20, 25, 55
),
-- 13. Мондо Овада
(
  '00000000-0000-0000-0000-000000000013',
  (SELECT id FROM characters WHERE slug = 'mondo-owada'),
  'Мондо Овада',
  1000,
  'free',
  50, 30, 55, 45
),
-- 14. Киётака Ишимару
(
  '00000000-0000-0000-0000-000000000014',
  (SELECT id FROM characters WHERE slug = 'kiyotaka-ishimaru'),
  'Киётака Ишимару',
  1000,
  'free',
  75, 10, 20, 70
),
-- 15. Хифуми Ямада
(
  '00000000-0000-0000-0000-000000000015',
  (SELECT id FROM characters WHERE slug = 'hifumi-yamada'),
  'Хифуми Ямада',
  1000,
  'free',
  40, 25, 45, 35
),
-- 16. Джунко Эношима
(
  '00000000-0000-0000-0000-000000000016',
  (SELECT id FROM characters WHERE slug = 'junko-enoshima'),
  'Джунко Эношима',
  1000,
  'free',
  10, 90, 95, 60
);
