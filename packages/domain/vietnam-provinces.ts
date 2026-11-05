import { provinceGroups } from './vietnam-province-groups.js';
import { provinceRings } from './vietnam-geometry.js';
import type { JournalEntry } from './journal.js';

export type VietnamRegion =
  'bac-bo' | 'bac-trung-bo' | 'nam-trung-bo' | 'tay-nguyen' | 'dong-nam-bo' | 'tay-nam-bo';

export const regionNames: Record<VietnamRegion, string> = {
  'bac-bo': 'Miền Bắc',
  'bac-trung-bo': 'Bắc Trung Bộ',
  'nam-trung-bo': 'Duyên hải Nam Trung Bộ',
  'tay-nguyen': 'Tây Nguyên',
  'dong-nam-bo': 'Đông Nam Bộ',
  'tay-nam-bo': 'Đồng bằng sông Cửu Long',
};

export type ProvinceInfo = {
  id: string;
  name: string;
  region: VietnamRegion;
  lat: number;
  lng: number;
  aliases: string[];
  // Approximate coordinate on a normalized 400x900 map canvas
  mapX: number;
  mapY: number;
};

export const PASTEL_PALETTE = [
  '#f8b4a6', // pastel peach / coral
  '#b8cb9c', // pastel sage
  '#f9e29d', // pastel butter
  '#d2b7e5', // pastel lilac
  '#97d8c4', // pastel mint
  '#f6c3d5', // pastel rose
  '#a8d8ea', // pastel sky
  '#fcd5ce', // pastel blush
];

export const LEGACY_PROVINCES: ProvinceInfo[] = [
  // --- Miền Bắc ---
  {
    id: 'ha-giang',
    name: 'Hà Giang',
    region: 'bac-bo',
    lat: 22.82,
    lng: 104.98,
    mapX: 185,
    mapY: 70,
    aliases: ['hà giang', 'ha giang', 'đồng văn', 'lũng cú', 'mèo vạc', 'mã pí lèng'],
  },
  {
    id: 'cao-bang',
    name: 'Cao Bằng',
    region: 'bac-bo',
    lat: 22.67,
    lng: 106.26,
    mapX: 245,
    mapY: 85,
    aliases: ['cao bằng', 'cao bang', 'bản giốc', 'pác bó'],
  },
  {
    id: 'bac-kan',
    name: 'Bắc Kạn',
    region: 'bac-bo',
    lat: 22.14,
    lng: 105.83,
    mapX: 225,
    mapY: 115,
    aliases: ['bắc kạn', 'bac kan', 'ba bể'],
  },
  {
    id: 'tuyen-quang',
    name: 'Tuyên Quang',
    region: 'bac-bo',
    lat: 21.82,
    lng: 105.21,
    mapX: 195,
    mapY: 125,
    aliases: ['tuyên quang', 'tuyen quang', 'na hang'],
  },
  {
    id: 'lao-cai',
    name: 'Lào Cai',
    region: 'bac-bo',
    lat: 22.48,
    lng: 103.97,
    mapX: 145,
    mapY: 90,
    aliases: ['lào cai', 'lao cai', 'sa pa', 'sapa', 'fansipan'],
  },
  {
    id: 'yen-bai',
    name: 'Yên Bái',
    region: 'bac-bo',
    lat: 21.72,
    lng: 104.91,
    mapX: 175,
    mapY: 140,
    aliases: ['yên bái', 'yen bai', 'mù cang chải', 'mu cang chai', 'nghĩa lộ'],
  },
  {
    id: 'thai-nguyen',
    name: 'Thái Nguyên',
    region: 'bac-bo',
    lat: 21.59,
    lng: 105.84,
    mapX: 225,
    mapY: 145,
    aliases: ['thái nguyên', 'thai nguyen', 'hồ núi cốc'],
  },
  {
    id: 'lang-son',
    name: 'Lạng Sơn',
    region: 'bac-bo',
    lat: 21.85,
    lng: 106.76,
    mapX: 270,
    mapY: 130,
    aliases: ['lạng sơn', 'lang son', 'mẫu sơn', 'đồng đăng'],
  },
  {
    id: 'bac-giang',
    name: 'Bắc Giang',
    region: 'bac-bo',
    lat: 21.27,
    lng: 106.2,
    mapX: 245,
    mapY: 165,
    aliases: ['bắc giang', 'bac giang', 'lục ngạn'],
  },
  {
    id: 'quang-ninh',
    name: 'Quảng Ninh',
    region: 'bac-bo',
    lat: 21.01,
    lng: 107.29,
    mapX: 285,
    mapY: 165,
    aliases: [
      'quảng ninh',
      'quang ninh',
      'hạ long',
      'ha long',
      'cô tô',
      'vân đồn',
      'yên tử',
      'bãi cháy',
    ],
  },
  {
    id: 'dien-bien',
    name: 'Điện Biên',
    region: 'bac-bo',
    lat: 21.39,
    lng: 103.02,
    mapX: 95,
    mapY: 145,
    aliases: ['điện biên', 'dien bien', 'mường thanh', 'a pa chải'],
  },
  {
    id: 'lai-chau',
    name: 'Lai Châu',
    region: 'bac-bo',
    lat: 22.4,
    lng: 103.47,
    mapX: 120,
    mapY: 105,
    aliases: ['lai châu', 'lai chau', 'ô quy hồ', 'sin suối hồ'],
  },
  {
    id: 'son-la',
    name: 'Sơn La',
    region: 'bac-bo',
    lat: 21.33,
    lng: 103.91,
    mapX: 135,
    mapY: 165,
    aliases: ['sơn la', 'son la', 'mộc châu', 'moc chau', 'tà xùa'],
  },
  {
    id: 'hoa-binh',
    name: 'Hòa Bình',
    region: 'bac-bo',
    lat: 20.81,
    lng: 105.34,
    mapX: 180,
    mapY: 185,
    aliases: ['hòa bình', 'hoa binh', 'mai châu', 'thung nai'],
  },
  {
    id: 'ha-noi',
    name: 'Hà Nội',
    region: 'bac-bo',
    lat: 21.03,
    lng: 105.85,
    mapX: 215,
    mapY: 175,
    aliases: ['hà nội', 'ha noi', 'hanoi', 'hoàn kiếm', 'tây hồ', 'ba đình', 'phố cổ'],
  },
  {
    id: 'hai-phong',
    name: 'Hải Phòng',
    region: 'bac-bo',
    lat: 20.86,
    lng: 106.68,
    mapX: 260,
    mapY: 185,
    aliases: ['hải phòng', 'hai phong', 'cát bà', 'đồ sơn'],
  },
  {
    id: 'hai-duong',
    name: 'Hải Dương',
    region: 'bac-bo',
    lat: 20.94,
    lng: 106.33,
    mapX: 240,
    mapY: 180,
    aliases: ['hải dương', 'hai duong', 'côn sơn', 'kiếp bạc'],
  },
  {
    id: 'hung-yen',
    name: 'Hưng Yên',
    region: 'bac-bo',
    lat: 20.65,
    lng: 106.05,
    mapX: 225,
    mapY: 195,
    aliases: ['hưng yên', 'hung yen', 'phố hiến'],
  },
  {
    id: 'bac-ninh',
    name: 'Bắc Ninh',
    region: 'bac-bo',
    lat: 21.19,
    lng: 106.07,
    mapX: 230,
    mapY: 165,
    aliases: ['bắc ninh', 'bac ninh', 'kinh bắc'],
  },
  {
    id: 'ha-nam',
    name: 'Hà Nam',
    region: 'bac-bo',
    lat: 20.54,
    lng: 105.91,
    mapX: 215,
    mapY: 210,
    aliases: ['hà nam', 'ha nam', 'tam chúc'],
  },
  {
    id: 'nam-dinh',
    name: 'Nam Định',
    region: 'bac-bo',
    lat: 20.42,
    lng: 106.17,
    mapX: 235,
    mapY: 220,
    aliases: ['nam định', 'nam dinh', 'quất lâm'],
  },
  {
    id: 'ninh-binh',
    name: 'Ninh Bình',
    region: 'bac-bo',
    lat: 20.25,
    lng: 105.97,
    mapX: 210,
    mapY: 230,
    aliases: [
      'ninh bình',
      'ninh binh',
      'tràng an',
      'tam cốc',
      'bái đính',
      'hang múa',
      'cúc phương',
    ],
  },
  {
    id: 'thai-binh',
    name: 'Thái Bình',
    region: 'bac-bo',
    lat: 20.45,
    lng: 106.34,
    mapX: 250,
    mapY: 210,
    aliases: ['thái bình', 'thai binh', 'đồng châu'],
  },
  {
    id: 'vinh-phuc',
    name: 'Vĩnh Phúc',
    region: 'bac-bo',
    lat: 21.31,
    lng: 105.6,
    mapX: 200,
    mapY: 155,
    aliases: ['vĩnh phúc', 'vinh phuc', 'tam đảo', 'đại lải'],
  },
  {
    id: 'phu-tho',
    name: 'Phú Thọ',
    region: 'bac-bo',
    lat: 21.32,
    lng: 105.23,
    mapX: 180,
    mapY: 160,
    aliases: ['phú thọ', 'phu tho', 'đền hùng'],
  },

  // --- Bắc Trung Bộ ---
  {
    id: 'thanh-hoa',
    name: 'Thanh Hóa',
    region: 'bac-trung-bo',
    lat: 19.81,
    lng: 105.77,
    mapX: 200,
    mapY: 260,
    aliases: ['thanh hóa', 'thanh hoa', 'sầm sơn', 'pù luông', 'hải tiến'],
  },
  {
    id: 'nghe-an',
    name: 'Nghệ An',
    region: 'bac-trung-bo',
    lat: 19.23,
    lng: 104.92,
    mapX: 180,
    mapY: 300,
    aliases: ['nghệ an', 'nghe an', 'cửa lò', 'vinh', 'nam đàn'],
  },
  {
    id: 'ha-tinh',
    name: 'Hà Tĩnh',
    region: 'bac-trung-bo',
    lat: 18.34,
    lng: 105.91,
    mapX: 205,
    mapY: 340,
    aliases: ['hà tĩnh', 'ha tinh', 'thiên cầm', 'ngã ba đồng lộc'],
  },
  {
    id: 'quang-binh',
    name: 'Quảng Bình',
    region: 'bac-trung-bo',
    lat: 17.47,
    lng: 106.6,
    mapX: 220,
    mapY: 380,
    aliases: ['quảng bình', 'quang binh', 'phong nha', 'kẻ bàng', 'đồng hới', 'sơn đoòng'],
  },
  {
    id: 'quang-tri',
    name: 'Quảng Trị',
    region: 'bac-trung-bo',
    lat: 16.75,
    lng: 107.19,
    mapX: 235,
    mapY: 415,
    aliases: ['quảng trị', 'quang tri', 'đông hà', 'cửa tùng'],
  },
  {
    id: 'thua-thien-hue',
    name: 'Thừa Thiên Huế',
    region: 'bac-trung-bo',
    lat: 16.47,
    lng: 107.59,
    mapX: 250,
    mapY: 445,
    aliases: ['thừa thiên huế', 'thua thien hue', 'huế', 'hue', 'lăng cô', 'hương giang'],
  },

  // --- Duyên hải Nam Trung Bộ ---
  {
    id: 'da-nang',
    name: 'Đà Nẵng',
    region: 'nam-trung-bo',
    lat: 16.05,
    lng: 108.2,
    mapX: 265,
    mapY: 470,
    aliases: [
      'đà nẵng',
      'da nang',
      'danang',
      'bà nà',
      'bana hills',
      'sơn trà',
      'mỹ khê',
      'ngũ hành sơn',
    ],
  },
  {
    id: 'quang-nam',
    name: 'Quảng Nam',
    region: 'nam-trung-bo',
    lat: 15.59,
    lng: 108.15,
    mapX: 260,
    mapY: 500,
    aliases: ['quảng nam', 'quang nam', 'hội an', 'hoi an', 'mỹ sơn', 'tam kỳ', 'cù lao chàm'],
  },
  {
    id: 'quang-ngai',
    name: 'Quảng Ngãi',
    region: 'nam-trung-bo',
    lat: 15.12,
    lng: 108.8,
    mapX: 280,
    mapY: 530,
    aliases: ['quảng ngãi', 'quang ngai', 'lý sơn', 'ly son', 'mỹ khê quảng ngãi'],
  },
  {
    id: 'binh-dinh',
    name: 'Bình Định',
    region: 'nam-trung-bo',
    lat: 14.17,
    lng: 109.05,
    mapX: 290,
    mapY: 565,
    aliases: ['bình định', 'binh dinh', 'quy nhơn', 'quy nhon', 'kỳ co', 'eo gió'],
  },
  {
    id: 'phu-yen',
    name: 'Phú Yên',
    region: 'nam-trung-bo',
    lat: 13.09,
    lng: 109.32,
    mapX: 300,
    mapY: 605,
    aliases: ['phú yên', 'phu yen', 'tuy hòa', 'gành đá đĩa', 'mũi điện'],
  },
  {
    id: 'khanh-hoa',
    name: 'Khánh Hòa',
    region: 'nam-trung-bo',
    lat: 12.24,
    lng: 109.19,
    mapX: 305,
    mapY: 650,
    aliases: [
      'khánh hòa',
      'khanh hoa',
      'nha trang',
      'cam ranh',
      'bình ba',
      'điệp sơn',
      'vân phong',
    ],
  },
  {
    id: 'ninh-thuan',
    name: 'Ninh Thuận',
    region: 'nam-trung-bo',
    lat: 11.56,
    lng: 108.99,
    mapX: 295,
    mapY: 690,
    aliases: ['ninh thuận', 'ninh thuan', 'phan rang', 'vĩnh hy', 'mũi dinh'],
  },
  {
    id: 'binh-thuan',
    name: 'Bình Thuận',
    region: 'nam-trung-bo',
    lat: 11.1,
    lng: 108.2,
    mapX: 275,
    mapY: 725,
    aliases: ['bình thuận', 'binh thuan', 'phan thiết', 'mũi né', 'mui ne', 'kê gà', 'phú quý'],
  },

  // --- Tây Nguyên ---
  {
    id: 'kon-tum',
    name: 'Kon Tum',
    region: 'tay-nguyen',
    lat: 14.35,
    lng: 108.0,
    mapX: 245,
    mapY: 550,
    aliases: ['kon tum', 'kontum', 'măng đen', 'mang den', 'ngọc hồi'],
  },
  {
    id: 'gia-lai',
    name: 'Gia Lai',
    region: 'tay-nguyen',
    lat: 13.98,
    lng: 108.0,
    mapX: 250,
    mapY: 585,
    aliases: ['gia lai', 'pleiku', 'biển hồ'],
  },
  {
    id: 'dak-lak',
    name: 'Đắk Lắk',
    region: 'tay-nguyen',
    lat: 12.67,
    lng: 108.04,
    mapX: 255,
    mapY: 630,
    aliases: [
      'đắk lắk',
      'dak lak',
      'đắc lắc',
      'buôn ma thuột',
      'buon ma thuot',
      'bản đôn',
      'hồ lắk',
    ],
  },
  {
    id: 'dak-nong',
    name: 'Đắk Nông',
    region: 'tay-nguyen',
    lat: 12.0,
    lng: 107.69,
    mapX: 240,
    mapY: 670,
    aliases: ['đắk nông', 'dak nong', 'gia nghĩa', 'tà đùng'],
  },
  {
    id: 'lam-dong',
    name: 'Lâm Đồng',
    region: 'tay-nguyen',
    lat: 11.94,
    lng: 108.44,
    mapX: 270,
    mapY: 675,
    aliases: [
      'lâm đồng',
      'lam dong',
      'đà lạt',
      'da lat',
      'dalat',
      'bảo lộc',
      'tuyền lâm',
      'langbiang',
    ],
  },

  // --- Đông Nam Bộ ---
  {
    id: 'binh-phuoc',
    name: 'Bình Phước',
    region: 'dong-nam-bo',
    lat: 11.75,
    lng: 106.9,
    mapX: 215,
    mapY: 710,
    aliases: ['bình phước', 'binh phuoc', 'đồng xoài', 'bù gia mập'],
  },
  {
    id: 'tay-ninh',
    name: 'Tây Ninh',
    region: 'dong-nam-bo',
    lat: 11.31,
    lng: 106.1,
    mapX: 185,
    mapY: 730,
    aliases: ['tây ninh', 'tay ninh', 'núi bà đen', 'tòa thánh'],
  },
  {
    id: 'binh-duong',
    name: 'Bình Dương',
    region: 'dong-nam-bo',
    lat: 11.17,
    lng: 106.65,
    mapX: 205,
    mapY: 735,
    aliases: ['bình dương', 'binh duong', 'thủ dầu một', 'dĩ an'],
  },
  {
    id: 'dong-nai',
    name: 'Đồng Nai',
    region: 'dong-nam-bo',
    lat: 11.05,
    lng: 107.17,
    mapX: 230,
    mapY: 745,
    aliases: ['đồng nai', 'dong nai', 'biên hòa', 'nam cát tiên', 'trị an'],
  },
  {
    id: 'ba-ria-vung-tau',
    name: 'Bà Rịa - Vũng Tàu',
    region: 'dong-nam-bo',
    lat: 10.54,
    lng: 107.24,
    mapX: 235,
    mapY: 775,
    aliases: [
      'bà rịa',
      'vũng tàu',
      'vung tau',
      'ba ria',
      'côn đảo',
      'con dao',
      'long hải',
      'hồ tràm',
    ],
  },
  {
    id: 'tp-hcm',
    name: 'TP. Hồ Chí Minh',
    region: 'dong-nam-bo',
    lat: 10.78,
    lng: 106.7,
    mapX: 200,
    mapY: 760,
    aliases: [
      'hồ chí minh',
      'ho chi minh',
      'sài gòn',
      'saigon',
      'tp.hcm',
      'tphcm',
      'quận 1',
      'thủ đức',
    ],
  },

  // --- Đồng bằng sông Cửu Long ---
  {
    id: 'long-an',
    name: 'Long An',
    region: 'tay-nam-bo',
    lat: 10.53,
    lng: 106.41,
    mapX: 185,
    mapY: 770,
    aliases: ['long an', 'tân an', 'đồng tháp mười'],
  },
  {
    id: 'tien-giang',
    name: 'Tiền Giang',
    region: 'tay-nam-bo',
    lat: 10.43,
    lng: 106.34,
    mapX: 190,
    mapY: 785,
    aliases: ['tiền giang', 'tien giang', 'mỹ tho', 'cái bè'],
  },
  {
    id: 'ben-tre',
    name: 'Bến Tre',
    region: 'tay-nam-bo',
    lat: 10.24,
    lng: 106.38,
    mapX: 195,
    mapY: 800,
    aliases: ['bến tre', 'ben tre', 'xứ dừa', 'chợ lách'],
  },
  {
    id: 'tra-vinh',
    name: 'Trà Vinh',
    region: 'tay-nam-bo',
    lat: 9.93,
    lng: 106.34,
    mapX: 190,
    mapY: 820,
    aliases: ['trà vinh', 'tra vinh', 'ba động'],
  },
  {
    id: 'vinh-long',
    name: 'Vĩnh Long',
    region: 'tay-nam-bo',
    lat: 10.25,
    lng: 105.97,
    mapX: 175,
    mapY: 795,
    aliases: ['vĩnh long', 'vinh long', 'an bình'],
  },
  {
    id: 'dong-thap',
    name: 'Đồng Tháp',
    region: 'tay-nam-bo',
    lat: 10.46,
    lng: 105.63,
    mapX: 160,
    mapY: 775,
    aliases: ['đồng tháp', 'dong thap', 'cao lãnh', 'sa đéc', 'tràm chim'],
  },
  {
    id: 'an-giang',
    name: 'An Giang',
    region: 'tay-nam-bo',
    lat: 10.52,
    lng: 105.12,
    mapX: 140,
    mapY: 770,
    aliases: ['an giang', 'long xuyên', 'châu đốc', 'núi sam', 'trà sư'],
  },
  {
    id: 'kien-giang',
    name: 'Kiên Giang',
    region: 'tay-nam-bo',
    lat: 10.01,
    lng: 105.08,
    mapX: 130,
    mapY: 805,
    aliases: ['kiên giang', 'kien giang', 'phú quốc', 'phu quoc', 'hà tiên', 'rạch giá', 'nam du'],
  },
  {
    id: 'can-tho',
    name: 'Cần Thơ',
    region: 'tay-nam-bo',
    lat: 10.04,
    lng: 105.78,
    mapX: 165,
    mapY: 805,
    aliases: ['cần thơ', 'can tho', 'ninh kiều', 'cái răng', 'tây đô'],
  },
  {
    id: 'hau-giang',
    name: 'Hậu Giang',
    region: 'tay-nam-bo',
    lat: 9.78,
    lng: 105.47,
    mapX: 160,
    mapY: 820,
    aliases: ['hậu giang', 'hau giang', 'vị thanh', 'ngã bảy'],
  },
  {
    id: 'soc-trang',
    name: 'Sóc Trăng',
    region: 'tay-nam-bo',
    lat: 9.6,
    lng: 105.97,
    mapX: 175,
    mapY: 835,
    aliases: ['sóc trăng', 'soc trang', 'chùa dơi'],
  },
  {
    id: 'bac-lieu',
    name: 'Bạc Liêu',
    region: 'tay-nam-bo',
    lat: 9.29,
    lng: 105.72,
    mapX: 155,
    mapY: 855,
    aliases: ['bạc liêu', 'bac lieu', 'công tử bạc liêu', 'nhà mát'],
  },
  {
    id: 'ca-mau',
    name: 'Cà Mau',
    region: 'tay-nam-bo',
    lat: 9.18,
    lng: 105.15,
    mapX: 130,
    mapY: 875,
    aliases: ['cà mau', 'ca mau', 'đất mũi', 'u minh'],
  },
];

// Normalize Vietnamese string for loose matching (remove diacritics and special characters)
export const VIETNAM_PROVINCES: ProvinceInfo[] = [
  ...LEGACY_PROVINCES.filter((p) => !Object.values(provinceGroups).flat().includes(p.id)),
  ...Object.entries(provinceGroups).map(([id, members]) => {
    const source = LEGACY_PROVINCES.find((p) => p.id === (id === 'hue' ? 'thua-thien-hue' : id))!;
    return {
      ...source,
      id,
      name: id === 'hue' ? 'Thành phố Huế' : source.name,
      aliases: members.flatMap((member) => {
        const p = LEGACY_PROVINCES.find((p) => p.id === member)!;
        return [p.name, ...p.aliases];
      }),
    };
  }),
].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
export function normalizeVietnamese(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match current province geometry, with an exact location-label fallback for simplified islands.
 */
export function detectProvince(entry: JournalEntry): string | null {
  if (
    !entry.location ||
    entry.kind === 'plan' ||
    entry.date >
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  )
    return null;
  const { latitude: y, longitude: x } = entry.location;
  for (const p of VIETNAM_PROVINCES) {
    let inside = false;
    for (const ring of provinceRings[p.id] || []) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i],
          [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return p.id;
  }

  const islandLabel = normalizeVietnamese(entry.location.label || '');
  if (y >= 15 && y <= 18 && x >= 110 && x <= 114 && islandLabel.includes('hoang sa'))
    return 'da-nang';
  if (y >= 6 && y <= 13 && x >= 110 && x <= 118 && islandLabel.includes('truong sa'))
    return 'khanh-hoa';
  if (y >= 8.2 && y <= 23.6 && x >= 102 && x <= 110) {
    const label = normalizeVietnamese(entry.location.label || '');
    const named = VIETNAM_PROVINCES.find((p) =>
      p.aliases.some((a) => normalizeVietnamese(a) === label),
    );
    if (named) return named.id;
  }
  return null;
}

/**
 * Summarize footprints: maps provinceId -> list of entries.
 */
export function groupFootprintsByProvince(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const result = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const provId = detectProvince(entry);
    if (provId) {
      const list = result.get(provId) || [];
      list.push(entry);
      result.set(provId, list);
    }
  }
  return result;
}
