export type Role = 'approve' | 'finance' | 'service' | 'view';

export const PASSWORDS: Record<string, Role> = {
  zhangze123: 'approve',
  '8888': 'approve',
  '666': 'service',
  '16586666': 'finance',
  '1658666': 'view',
};

// Only these passwords can hard-delete data
export const HARD_DELETE_PASSWORDS = new Set(['8888', 'zhangze123']);

export const ROLE_LABELS: Record<Role, string> = {
  approve: '老板',
  finance: '财务(录入)',
  service: '客服(录入)',
  view: '云吉员工',
};

// Per-role visible page IDs
export const ROLE_PAGES: Record<Role, string[]> = {
  approve: ['home', 'schedule', 'orders', 'finance', 'members', 'business', 'dashboard'],
  finance: ['home', 'schedule', 'orders', 'finance', 'members', 'business'],
  service: ['home', 'schedule', 'orders', 'members'],
  view:    ['home', 'schedule', 'orders', 'members'],
};

export interface Venue {
  id: string;
  name: string;
  capacity: string;
  slots: string[];
}

export const VENUES: Venue[] = [
  { id: 'north', name: '北厢房', capacity: '14人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'south', name: '南厢房', capacity: '8人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'east', name: '东厢房', capacity: '4人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'west', name: '西厢房', capacity: '4人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'sky', name: '天窗厅', capacity: '12人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'cloud', name: '云徕厅', capacity: '10人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'banquet', name: '宴会厅', capacity: '40+人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
  { id: 'ktv', name: 'KTV', capacity: '25人', slots: ['上午', '午餐', '下午', '晚餐', '晚场'] },
];

export const ORDER_TYPES = ['餐饮', '喝茶', '活动/会议', 'KTV'] as const;

export const ACTIONS = ['吃饭', '喝茶', '唱歌', '开会', '活动', '商务会谈', '生日宴', '婚宴'] as const;

export const MEMBER_LEVELS = ['散客', '逢吉', '承吉', '享吉', '开吉', '云集旧会员', '股东'] as const;

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '待确认': { bg: 'bg-[#FDF3E3]', text: 'text-[#8B5E1A]', border: 'border-[#E8C07A]' },
  '已确认': { bg: 'bg-[#EAF4EE]', text: 'text-[#2D6A4F]', border: 'border-[#A8D5B5]' },
  '已收款': { bg: 'bg-[#F3EDF9]', text: 'text-[#5B3A8C]', border: 'border-[#C4A8E0]' },
  '已入账': { bg: 'bg-[#EBF3FA]', text: 'text-[#1B4F7A]', border: 'border-[#A3C9E8]' },
  '已取消': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
};

export const STATUS_CELL_COLORS: Record<string, string> = {
  '待确认': '#FDF3E3',
  '已确认': '#EAF4EE',
  '已收款': '#F3EDF9',
  '已入账': '#EBF3FA',
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  '待确认': '#8B5E1A',
  '已确认': '#2D6A4F',
  '已收款': '#5B3A8C',
  '已入账': '#1B4F7A',
};

export const ALL_SLOTS = ['上午', '午餐', '下午', '晚餐', '晚场'] as const;
