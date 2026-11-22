// Dữ liệu mục Phát âm (IPA Anh–Anh, theo tài liệu "Phát âm và IPA cho người Việt").

// 44 âm. id dùng trong địa chỉ #/psound/<id>.
//  kind: short | long (nguyên âm đơn) · diph (nguyên âm đôi) · vl / vd (phụ âm vô thanh / hữu thanh) · other (phụ âm còn lại)
export const SOUNDS = [
  // 12 nguyên âm đơn
  { id: 'i-long', ipa: 'iː', kind: 'long', vi: '"i" kéo dài', mouth: 'Môi kéo sang hai bên như cười, lưỡi cao', ex: ['see', 'eat', 'people', 'key'], mate: 'i-short' },
  { id: 'i-short', ipa: 'ɪ', kind: 'short', vi: '"i" ngắn, hơi ngả sang "ê"', mouth: 'Môi thả lỏng, miệng mở hơn /iː/ một chút', ex: ['sit', 'big', 'women', 'busy'], mate: 'i-long' },
  { id: 'e', ipa: 'e', kind: 'short', vi: '"e" ngắn', mouth: 'Miệng mở vừa', ex: ['bed', 'head', 'any', 'said'], mate: 'ae' },
  { id: 'ae', ipa: 'æ', kind: 'short', vi: 'giữa "a" và "e", mở rất rộng', mouth: 'Hàm hạ xuống thấp, môi kéo ngang', ex: ['cat', 'bad', 'man', 'black'], mate: 'e' },
  { id: 'uh', ipa: 'ʌ', kind: 'short', vi: '"ă"', mouth: 'Miệng mở vừa, lưỡi ở giữa', ex: ['cup', 'love', 'money', 'blood'], mate: 'a-long' },
  { id: 'a-long', ipa: 'ɑː', kind: 'long', vi: '"a" kéo dài, sâu trong họng', mouth: 'Miệng mở rộng, lưỡi thấp và lùi sau', ex: ['car', 'father', 'heart', 'class'], mate: 'uh', note: 'class đọc /ɑː/ theo Anh–Anh.' },
  { id: 'o-short', ipa: 'ɒ', kind: 'short', vi: '"o" ngắn', mouth: 'Môi hơi tròn, miệng mở', ex: ['hot', 'dog', 'what', 'want'], mate: 'o-long', note: 'Anh–Mỹ đọc gần /ɑː/.' },
  { id: 'o-long', ipa: 'ɔː', kind: 'long', vi: '"o" kéo dài', mouth: 'Môi tròn, đẩy ra trước', ex: ['door', 'four', 'saw', 'talk'], mate: 'o-short' },
  { id: 'u-short', ipa: 'ʊ', kind: 'short', vi: '"ư" ngắn, hơi tròn môi', mouth: 'Môi tròn nhẹ, thả lỏng', ex: ['book', 'good', 'put', 'could'], mate: 'u-long' },
  { id: 'u-long', ipa: 'uː', kind: 'long', vi: '"u" kéo dài', mouth: 'Môi tròn và chúm chặt', ex: ['food', 'blue', 'shoe', 'two'], mate: 'u-short' },
  { id: 'er', ipa: 'ɜː', kind: 'long', vi: '"ơ" kéo dài', mouth: 'Môi không tròn, lưỡi ở giữa', ex: ['bird', 'work', 'learn', 'nurse'], mate: 'schwa' },
  { id: 'schwa', ipa: 'ə', kind: 'short', vi: '"ơ" rất nhẹ, lướt qua (schwa)', mouth: 'Mọi cơ thả lỏng', ex: ['about', 'teacher', 'again', 'banana'], mate: 'er', note: 'Âm phổ biến nhất tiếng Anh: có ở hầu hết âm tiết không nhấn, dù chữ cái là a, e, o hay u (problem /ˈprɒbləm/, support /səˈpɔːt/). Nói đúng schwa là bước lớn nhất để nghe giống người bản xứ.' },
  // 8 nguyên âm đôi
  { id: 'ei', ipa: 'eɪ', kind: 'diph', vi: '"ây"', mouth: 'Trượt từ /e/ sang /ɪ/', ex: ['day', 'name', 'rain', 'great'], mate: 'e', note: 'Người Việt hay đọc thành /e/ vì không trượt âm: late nghe như let.' },
  { id: 'ai', ipa: 'aɪ', kind: 'diph', vi: '"ai"', mouth: 'Trượt từ /a/ sang /ɪ/', ex: ['my', 'time', 'buy', 'night'] },
  { id: 'oi', ipa: 'ɔɪ', kind: 'diph', vi: '"oi"', mouth: 'Trượt từ /ɔ/ sang /ɪ/', ex: ['boy', 'coin', 'enjoy', 'noise'] },
  { id: 'au', ipa: 'aʊ', kind: 'diph', vi: '"ao"', mouth: 'Trượt từ /a/ sang /ʊ/', ex: ['now', 'house', 'town', 'loud'] },
  { id: 'ou', ipa: 'əʊ', kind: 'diph', vi: '"ơu" (Anh–Mỹ /oʊ/ "ôu")', mouth: 'Trượt từ /ə/ sang /ʊ/', ex: ['go', 'home', 'phone', 'know'], mate: 'o-long', note: 'Hay bị đọc thành /ɔː/: coat nghe như caught. Kéo hết âm trượt ra.' },
  { id: 'ia', ipa: 'ɪə', kind: 'diph', vi: '"ia"', mouth: 'Trượt từ /ɪ/ sang /ə/', ex: ['here', 'near', 'idea', 'beer'] },
  { id: 'ea', ipa: 'eə', kind: 'diph', vi: '"e-ơ" (Anh–Mỹ /er/)', mouth: 'Trượt từ /e/ sang /ə/', ex: ['hair', 'where', 'care', 'wear'] },
  { id: 'ua', ipa: 'ʊə', kind: 'diph', vi: '"ua"', mouth: 'Trượt từ /ʊ/ sang /ə/', ex: ['tour', 'pure', 'sure', 'cure'], note: 'Nhiều người Anh đọc sure, tour bằng /ɔː/.' },
  // 8 cặp vô thanh – hữu thanh
  { id: 'p', ipa: 'p', kind: 'vl', vi: '"p" bật hơi', mouth: 'Hai môi khép rồi bật hơi ra', ex: ['pen', 'happy', 'stop', 'pin'], mate: 'b', note: 'Ở đầu từ phải bật hơi mạnh (đặt tờ giấy trước miệng sẽ thấy rung), nếu không pin nghe thành bin.' },
  { id: 'b', ipa: 'b', kind: 'vd', vi: '"b"', mouth: 'Hai môi khép rồi bật ra, cổ họng rung', ex: ['bad', 'job', 'baby', 'big'], mate: 'p' },
  { id: 't', ipa: 't', kind: 'vl', vi: '"th" nhẹ, bật hơi', mouth: 'Đầu lưỡi chạm lợi sau răng trên', ex: ['tea', 'water', 'eight', 'time'], mate: 'd' },
  { id: 'd', ipa: 'd', kind: 'vd', vi: '"đ" nhẹ', mouth: 'Đầu lưỡi chạm lợi sau răng trên, cổ họng rung', ex: ['day', 'good', 'did', 'bed'], mate: 't' },
  { id: 'k', ipa: 'k', kind: 'vl', vi: '"kh" nhẹ, bật hơi', mouth: 'Cuống lưỡi chạm vòm họng mềm', ex: ['cat', 'back', 'key', 'book'], mate: 'g' },
  { id: 'g', ipa: 'ɡ', kind: 'vd', vi: '"g"', mouth: 'Cuống lưỡi chạm vòm họng mềm, cổ họng rung', ex: ['go', 'bag', 'big', 'again'], mate: 'k' },
  { id: 'f', ipa: 'f', kind: 'vl', vi: '"ph"', mouth: 'Răng trên chạm nhẹ môi dưới, thổi hơi', ex: ['fish', 'laugh', 'phone', 'off'], mate: 'v' },
  { id: 'v', ipa: 'v', kind: 'vd', vi: '"v"', mouth: 'Răng trên cắn nhẹ môi dưới, cổ họng rung', ex: ['very', 'love', 'five', 'have'], mate: 'f', note: 'Hay bị đọc thành /w/ hoặc /j/: very nghe như berry/wery.' },
  { id: 'th', ipa: 'θ', kind: 'vl', vi: 'không có trong tiếng Việt', mouth: 'Đầu lưỡi đặt giữa hai hàm răng, thổi hơi', ex: ['think', 'bath', 'three', 'month'], mate: 'dh', note: 'Hay bị đọc thành "th" tiếng Việt, /t/ hoặc /s/: think nghe như sink.' },
  { id: 'dh', ipa: 'ð', kind: 'vd', vi: 'không có trong tiếng Việt', mouth: 'Như /θ/ nhưng cổ họng rung', ex: ['this', 'mother', 'they', 'breathe'], mate: 'th', note: 'Hay bị đọc thành /d/ hoặc /z/: they nghe như day.' },
  { id: 's', ipa: 's', kind: 'vl', vi: '"x"', mouth: 'Đầu lưỡi gần lợi, hơi xì qua khe hẹp', ex: ['see', 'bus', 'rice', 'city'], mate: 'z' },
  { id: 'z', ipa: 'z', kind: 'vd', vi: '"d" miền Bắc rung nhẹ', mouth: 'Giữ nguyên miệng như /s/ nhưng cổ họng rung', ex: ['zoo', 'is', 'has', 'eyes'], mate: 's', note: 'Hay bị đọc thành /s/: eyes nghe như ice.' },
  { id: 'sh', ipa: 'ʃ', kind: 'vl', vi: '"s" miền Bắc nặng, chu môi', mouth: 'Môi hơi chu ra, lưỡi lùi sau /s/', ex: ['she', 'fish', 'shoe', 'nation'], mate: 'zh', note: 'Hay bị đọc thành /s/: she nghe như see.' },
  { id: 'zh', ipa: 'ʒ', kind: 'vd', vi: 'như /ʃ/ có rung', mouth: 'Như /ʃ/ nhưng cổ họng rung', ex: ['television', 'usually', 'measure', 'decision'], mate: 'sh' },
  { id: 'ch', ipa: 'tʃ', kind: 'vl', vi: '"ch" bật mạnh', mouth: 'Như /t/ + /ʃ/ nhập một', ex: ['chair', 'watch', 'teacher', 'choose'], mate: 'j' },
  { id: 'j', ipa: 'dʒ', kind: 'vd', vi: '"gi" bật mạnh', mouth: 'Bắt đầu bằng /d/ rồi bật ra, cổ họng rung', ex: ['job', 'orange', 'page', 'bridge'], mate: 'ch', note: 'Hay bị đọc thành "gi"/"d": jam nghe như yam.' },
  // 8 phụ âm còn lại
  { id: 'm', ipa: 'm', kind: 'other', vi: 'giống "m"', mouth: 'Hai môi khép, hơi đi qua mũi', ex: ['man', 'home', 'summer', 'time'] },
  { id: 'n', ipa: 'n', kind: 'other', vi: 'giống "n"', mouth: 'Đầu lưỡi chạm lợi, hơi đi qua mũi', ex: ['no', 'sun', 'dinner', 'ten'] },
  { id: 'ng', ipa: 'ŋ', kind: 'other', vi: 'giống "ng" cuối', mouth: 'Cuống lưỡi chạm vòm họng mềm, không đọc thêm /ɡ/', ex: ['sing', 'thinking', 'long', 'young'] },
  { id: 'h', ipa: 'h', kind: 'other', vi: 'giống "h"', mouth: 'Hơi thở nhẹ ra', ex: ['hot', 'behind', 'house', 'who'] },
  { id: 'l', ipa: 'l', kind: 'other', vi: 'giống "l"', mouth: 'Đầu lưỡi chạm lợi; cuối từ vẫn giữ lưỡi chạm lợi (feel, school)', ex: ['light', 'feel', 'school', 'people'], mate: 'r' },
  { id: 'r', ipa: 'r', kind: 'other', vi: 'không rung như "r" tiếng Việt', mouth: 'Cong lưỡi về sau, không chạm vòm miệng', ex: ['red', 'very', 'right', 'sorry'], mate: 'l', note: 'Hay lẫn với /l/: right nghe như light.' },
  { id: 'w', ipa: 'w', kind: 'other', vi: 'như "u" lướt', mouth: 'Môi tròn như "u" rồi mở nhanh', ex: ['we', 'quick', 'one', 'water'], mate: 'v' },
  { id: 'y', ipa: 'j', kind: 'other', vi: 'như "d" miền Nam / "gi" nhẹ', mouth: 'Mặt lưỡi nâng gần vòm miệng', ex: ['yes', 'you', 'use', 'year'] },
];

export const GROUPS = [
  { title: '12 nguyên âm đơn', kinds: ['short', 'long'], tip: 'Học theo cặp dài – ngắn. Âm dài (có ː) kéo gấp đôi, cơ miệng căng; âm ngắn phát nhanh, miệng thả lỏng.' },
  { title: '8 nguyên âm đôi', kinds: ['diph'], tip: 'Trượt từ âm đầu sang âm sau trong một lần phát. Âm đầu mạnh và rõ, âm sau nhẹ.' },
  { title: '24 phụ âm', kinds: ['vl', 'vd', 'other'], tip: 'Phần lớn đi thành cặp vô thanh – hữu thanh: cùng khẩu hình, chỉ khác dây thanh có rung hay không. Đặt tay lên cổ họng để kiểm tra.' },
];
export const KIND_NAME = { short: 'Nguyên âm ngắn', long: 'Nguyên âm dài', diph: 'Nguyên âm đôi', vl: 'Phụ âm vô thanh', vd: 'Phụ âm hữu thanh', other: 'Phụ âm' };

// Cặp tối thiểu (minimal pairs) cho các âm người Việt hay sai.
export const PAIRS = [
  { id: 'th', title: '/θ/ hay /s/, /t/', sounds: ['th', 's'], pairs: [['think', 'sink'], ['three', 'tree'], ['thank', 'tank'], ['thick', 'sick'], ['path', 'pass']], tip: 'Thò đầu lưỡi ra giữa hai hàm răng rồi thổi hơi.' },
  { id: 'dh', title: '/ð/ hay /d/', sounds: ['dh', 'd'], pairs: [['they', 'day'], ['then', 'den'], ['breathe', 'breeze'], ['though', 'dough']], tip: 'Như /θ/ nhưng rung cổ họng.' },
  { id: 'ii', title: '/iː/ hay /ɪ/', sounds: ['i-long', 'i-short'], pairs: [['sheep', 'ship'], ['leave', 'live'], ['seat', 'sit'], ['feel', 'fill'], ['heat', 'hit']], tip: '/iː/ cười rộng và kéo dài; /ɪ/ ngắn, thả lỏng.' },
  { id: 'ae', title: '/æ/ hay /e/', sounds: ['ae', 'e'], pairs: [['bad', 'bed'], ['man', 'men'], ['sat', 'set'], ['had', 'head']], tip: 'Hạ hàm thấp hẳn xuống cho /æ/.' },
  { id: 'uu', title: '/uː/ hay /ʊ/', sounds: ['u-long', 'u-short'], pairs: [['pool', 'pull'], ['food', 'foot'], ['Luke', 'look'], ['fool', 'full']], tip: '/uː/ chúm môi chặt và kéo dài.' },
  { id: 'sh', title: '/ʃ/ hay /s/', sounds: ['sh', 's'], pairs: [['she', 'see'], ['ship', 'sip'], ['shoe', 'Sue'], ['shine', 'sign']], tip: 'Chu môi, lưỡi lùi về sau.' },
  { id: 'z', title: '/z/ hay /s/', sounds: ['z', 's'], pairs: [['zoo', 'Sue'], ['rise', 'rice'], ['eyes', 'ice'], ['prize', 'price']], tip: 'Giữ nguyên miệng /s/ nhưng rung cổ họng.' },
  { id: 'v', title: '/v/ hay /b/, /w/', sounds: ['v', 'w'], pairs: [['very', 'berry'], ['vest', 'west'], ['vine', 'wine'], ['vet', 'wet']], tip: 'Răng trên cắn nhẹ môi dưới.' },
  { id: 'rl', title: '/r/ hay /l/', sounds: ['r', 'l'], pairs: [['right', 'light'], ['rice', 'lice'], ['road', 'load'], ['grass', 'glass']], tip: '/r/ lưỡi không chạm gì; /l/ lưỡi chạm lợi.' },
  { id: 'dj', title: '/dʒ/ hay /j/', sounds: ['j', 'y'], pairs: [['jam', 'yam'], ['joke', 'yolk'], ['jet', 'yet'], ['juice', 'use']], tip: 'Bắt đầu bằng /d/ rồi bật ra.' },
  { id: 'pb', title: '/p/ hay /b/', sounds: ['p', 'b'], pairs: [['pea', 'bee'], ['cap', 'cab'], ['pig', 'big'], ['pear', 'bear']], tip: 'Bật hơi mạnh ở đầu từ cho /p/.' },
  { id: 'eie', title: '/eɪ/ hay /e/', sounds: ['ei', 'e'], pairs: [['late', 'let'], ['wait', 'wet'], ['taste', 'test'], ['pain', 'pen']], tip: 'Kéo hết âm trượt /e/ → /ɪ/.' },
];

// Đuôi -s / -ed: s = /s/ hoặc /t/ · z = /z/ hoặc /d/ · iz = /ɪz/ hoặc /ɪd/ (thêm 1 âm tiết)
export const ENDINGS = {
  s: { label: '-s / -es', opts: [['iz', '/ɪz/'], ['s', '/s/'], ['z', '/z/']], why: { iz: 'Sau /s z ʃ ʒ tʃ dʒ/ → /ɪz/ (thêm một âm tiết).', s: 'Sau âm vô thanh /p t k f θ/ → /s/.', z: 'Sau nguyên âm và âm hữu thanh còn lại → /z/.' },
    words: [['buses', 'iz'], ['watches', 'iz'], ['pages', 'iz'], ['washes', 'iz'], ['boxes', 'iz'], ['books', 's'], ['stops', 's'], ['laughs', 's'], ['months', 's'], ['cats', 's'], ['dogs', 'z'], ['plays', 'z'], ['cars', 'z'], ['bags', 'z'], ['lives', 'z'], ['trees', 'z']] },
  ed: { label: '-ed', opts: [['iz', '/ɪd/'], ['s', '/t/'], ['z', '/d/']], why: { iz: 'Sau /t/ hoặc /d/ → /ɪd/ (thêm một âm tiết).', s: 'Sau âm vô thanh /p k s ʃ tʃ f θ/ → /t/.', z: 'Sau nguyên âm và âm hữu thanh còn lại → /d/.' },
    words: [['wanted', 'iz'], ['needed', 'iz'], ['visited', 'iz'], ['decided', 'iz'], ['started', 'iz'], ['stopped', 's'], ['watched', 's'], ['asked', 's'], ['laughed', 's'], ['washed', 's'], ['played', 'z'], ['cleaned', 'z'], ['lived', 'z'], ['opened', 'z'], ['called', 'z']] },
};

// Trọng âm: [từ, các âm tiết, vị trí nhấn (0 = âm tiết đầu), ghi chú]
export const STRESS = [
  ['table', ['ta', 'ble'], 0, 'Danh từ 2 âm tiết thường nhấn âm đầu.'],
  ['doctor', ['doc', 'tor'], 0, 'Danh từ 2 âm tiết thường nhấn âm đầu.'],
  ['happy', ['hap', 'py'], 0, 'Tính từ 2 âm tiết thường nhấn âm đầu.'],
  ['modern', ['mod', 'ern'], 0, 'Tính từ 2 âm tiết thường nhấn âm đầu.'],
  ['begin', ['be', 'gin'], 1, 'Động từ 2 âm tiết thường nhấn âm sau.'],
  ['decide', ['de', 'cide'], 1, 'Động từ 2 âm tiết thường nhấn âm sau.'],
  ['relax', ['re', 'lax'], 1, 'Động từ 2 âm tiết thường nhấn âm sau.'],
  ['forget', ['for', 'get'], 1, 'Động từ 2 âm tiết thường nhấn âm sau.'],
  ['record (n)', ['rec', 'ord'], 0, 'Vừa danh vừa động: danh từ nhấn đầu.'],
  ['record (v)', ['re', 'cord'], 1, 'Vừa danh vừa động: động từ nhấn sau.'],
  ['increase (n)', ['in', 'crease'], 0, 'Danh từ nhấn đầu: an ˈincrease.'],
  ['increase (v)', ['in', 'crease'], 1, 'Động từ nhấn sau: to inˈcrease.'],
  ['information', ['in', 'for', 'ma', 'tion'], 2, '-tion: nhấn âm tiết ngay trước hậu tố.'],
  ['decision', ['de', 'ci', 'sion'], 1, '-sion: nhấn âm tiết ngay trước hậu tố.'],
  ['economic', ['e', 'co', 'nom', 'ic'], 2, '-ic: nhấn âm tiết ngay trước hậu tố.'],
  ['university', ['u', 'ni', 'ver', 'si', 'ty'], 2, '-ity: nhấn âm tiết ngay trước hậu tố.'],
  ['musician', ['mu', 'si', 'cian'], 1, '-ian: nhấn âm tiết ngay trước hậu tố.'],
  ['employee', ['em', 'ploy', 'ee'], 2, '-ee: nhấn chính hậu tố.'],
  ['engineer', ['en', 'gi', 'neer'], 2, '-eer: nhấn chính hậu tố.'],
  ['Vietnamese', ['Vi', 'et', 'nam', 'ese'], 3, '-ese: nhấn chính hậu tố.'],
  ['family', ['fam', 'i', 'ly'], 0, '-y (3 âm tiết): nhấn âm tiết thứ ba từ cuối.'],
  ['photography', ['pho', 'tog', 'ra', 'phy'], 1, '-graphy: nhấn âm tiết thứ ba từ cuối.'],
  ['biology', ['bi', 'ol', 'o', 'gy'], 1, '-logy: nhấn âm tiết thứ ba từ cuối.'],
  ['concentrate', ['con', 'cen', 'trate'], 0, '-ate: nhấn âm tiết thứ ba từ cuối.'],
  ['develop', ['de', 'vel', 'op'], 1, 'Từ IELTS hay đọc sai: deˈvelop.'],
  ['comfortable', ['com', 'for', 'ta', 'ble'], 0, 'Từ hay đọc sai: ˈcomfortable.'],
  ['vegetable', ['veg', 'e', 'ta', 'ble'], 0, 'Từ hay đọc sai: ˈvegetable.'],
  ['hotel', ['ho', 'tel'], 1, 'Ngoại lệ: hoˈtel nhấn âm sau.'],
  ['event', ['e', 'vent'], 1, 'Từ hay đọc sai: eˈvent.'],
  ['percentage', ['per', 'cen', 'tage'], 1, 'Từ IELTS hay đọc sai: perˈcentage.'],
  ['environment', ['en', 'vi', 'ron', 'ment'], 1, '-ment không đổi trọng âm: enˈvironment.'],
  ['category', ['cat', 'e', 'go', 'ry'], 0, 'Từ hay đọc sai: ˈcategory.'],
  ['advantage', ['ad', 'van', 'tage'], 1, 'Từ IELTS hay đọc sai: adˈvantage.'],
  ['photographer', ['pho', 'tog', 'ra', 'pher'], 1, 'Cùng họ: ˈphotograph → phoˈtographer.'],
  ['political', ['po', 'lit', 'i', 'cal'], 1, '-ical: nhấn âm tiết ngay trước hậu tố.'],
];

// Lý thuyết đọc thêm. Mỗi bảng: { head: [...], rows: [[...]], say: chỉ số cột có thể bấm nghe }
export const TOPICS = [
  { id: 'symbols', title: 'Đọc ký hiệu trong từ điển', level: 'A1', intro: 'IPA giúp đọc đúng từ mới ngay khi tra từ điển, không phải đoán theo mặt chữ (ough đọc khác nhau trong though, through, tough, cough). App dùng phiên âm Anh–Anh như Cambridge Dictionary và đề IELTS.',
    tables: [{ head: ['Ký hiệu', 'Ý nghĩa', 'Ví dụ'], rows: [['/ /', 'Phiên âm nằm giữa hai dấu gạch', 'cat /kæt/'], ['ˈ', 'Trọng âm chính, đặt trước âm tiết được nhấn', 'water /ˈwɔːtə/'], ['ˌ', 'Trọng âm phụ (nhấn nhẹ hơn)', 'education /ˌedʒuˈkeɪʃn/'], ['ː', 'Nguyên âm dài', 'sheep /ʃiːp/ ≠ ship /ʃɪp/'], ['(r)', 'Anh–Anh không đọc, Anh–Mỹ đọc', 'car /kɑː(r)/']] }] },
  { id: 'finals', title: 'Âm cuối và cụm phụ âm', level: 'A2–B1', intro: 'Tiếng Việt hay nuốt âm cuối, còn tiếng Anh cần phát ra rõ: âm cuối mang thông tin ngữ pháp (số nhiều, ngôi thứ ba, quá khứ). Đây là lỗi khiến giám khảo khó nghe nhất.',
    tables: [{ head: ['Âm cuối', 'Bỏ âm thì thành', 'Ví dụ luyện'], say: 2, rows: [['/t/ – /d/', 'right → rye, bad → ba', 'cat, bed, hard, eight'], ['/s/ – /z/', 'bus → bu, dogs → dog', 'rice, eyes, cars, his'], ['/k/ – /ɡ/', 'bike → bai, bag → ba', 'book, look, dog, big'], ['/l/', 'school → scoo', 'feel, people, table, mile'], ['/v/', 'five → fie', 'have, love, live, five'], ['/ʃ/ /tʃ/ /dʒ/', 'fish → fi', 'wash, watch, page, bridge']] },
      { head: ['Cụm phụ âm', 'Sai hay gặp', 'Đúng'], say: 2, rows: [['Đầu từ /st/ /sp/ /str/', 'school → "sơ-cun", street → "sơ-trít"', 'school, street'], ['Cuối từ /sts/ /kst/', 'tests → test, texts → tex', 'tests, texts'], ['Có -s / -ed', 'asked → ask', 'asked']] }],
    tip: 'Đọc chậm, kéo nhẹ âm cuối ra như có một hơi nhỏ phía sau; quen rồi thì đọc nhanh dần. Không chèn nguyên âm vào giữa các phụ âm.' },
  { id: 'linking', title: 'Nối âm và âm yếu', level: 'B2–C1', intro: 'Giúp nói trôi chảy và nghe hiểu người bản xứ nói nhanh. Đây là ranh giới giữa Pronunciation band 6 và band 7.',
    tables: [{ head: ['Kiểu nối', 'Quy tắc', 'Ví dụ'], say: 2, rows: [['Phụ âm + nguyên âm', 'Phụ âm cuối kéo sang từ sau', 'turn off · pick it up'], ['Hai phụ âm giống nhau', 'Đọc một lần, giữ lâu hơn', 'bus stop · big girl · hot tea'], ['Nguyên âm + nguyên âm', 'Chèn /w/ hoặc /j/ nhẹ', 'go out · I am'], ['/t/, /d/ + /j/', 'Thành /tʃ/, /dʒ/', "don't you · did you"]] },
      { head: ['Từ', 'Dạng mạnh → yếu', 'Ví dụ'], say: 2, rows: [['a / an', '/eɪ/ /æn/ → /ə/ /ən/', 'a cup of tea'], ['the', '/ðiː/ → /ðə/', 'the bus'], ['to', '/tuː/ → /tə/', 'I want to go'], ['for', '/fɔː/ → /fə/', 'This is for you'], ['of', '/ɒv/ → /əv/', 'a lot of people'], ['and', '/ænd/ → /ən/', 'fish and chips'], ['can', '/kæn/ → /kən/', 'I can swim'], ['was / were', '/wɒz/ /wɜː/ → /wəz/ /wə/', 'It was late']] }],
    tip: "can luôn yếu /kən/ trong câu khẳng định, còn can't luôn mạnh /kɑːnt/ — đây là cách nghe phân biệt trong Listening." },
  { id: 'intonation', title: 'Trọng âm câu và ngữ điệu', level: 'B2–C1', intro: 'Nhấn vào từ mang nghĩa (danh từ, động từ chính, tính từ, trạng từ, từ phủ định), đọc lướt từ chức năng. Tiếng Anh có nhịp mạnh – yếu, khác tiếng Việt đọc đều từng tiếng.',
    tables: [{ head: ['Loại câu', 'Cuối câu', 'Ví dụ'], say: 2, rows: [['Câu kể', 'Xuống ↘', 'I live in a small town.'], ['Câu hỏi Wh-', 'Xuống ↘', 'Where do you live?'], ['Câu hỏi Yes/No', 'Lên ↗', 'Do you like it?'], ['Liệt kê', 'Lên ↗ … lên ↗ … xuống ↘', 'I bought apples, bread, and milk.'], ['Chưa nói xong ý', 'Giữ ngang hoặc lên nhẹ', 'When I was young, I lived in the countryside.']] },
      { head: ['Câu', 'Nhấn vào', 'Nghĩa'], rows: [['I didn\'t say that.', 'I', 'người khác nói'], ['I didn\'t say that.', 'say', 'tôi viết chứ không nói'], ['I didn\'t say that.', 'that', 'tôi nói điều khác']] }],
    tip: 'Trong Speaking, đọc đều đều một giọng nghe như đọc thuộc. Lên xuống giọng giúp câu trả lời tự nhiên và dễ nghe hơn.' },
];

export const WEEKS = [
  { n: 1, what: '12 nguyên âm đơn, đặc biệt các cặp dài – ngắn và schwa', done: 'Đọc đúng sheep – ship, bad – bed, pool – pull', go: '#/pron' },
  { n: 2, what: '8 nguyên âm đôi + 24 phụ âm', done: 'Nhìn phiên âm bất kỳ từ nào cũng đọc được', go: '#/pron' },
  { n: 3, what: 'Âm khó, âm cuối, cụm phụ âm, đuôi -s/-ed', done: 'Ghi âm của bạn nghe rõ /θ/, /ʃ/, /z/, /v/ và âm cuối', go: '#/ppairs' },
  { n: 4, what: 'Trọng âm từ, nối âm, âm yếu, ngữ điệu', done: 'Đọc một đoạn 5 câu có nhịp mạnh – yếu', go: '#/pquiz/stress' },
];
