export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  price: number | null;
  imageUrl?: string | null;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  featured: boolean;
  services: Service[];
}

export interface Slot {
  startAt: string;
  endAt: string;
}

export interface BusinessHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

export interface PublicSettings {
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  address: string | null;
  addressMapUrl: string | null;
  businessHours: BusinessHour[];
}

export interface CustomerInput {
  name: string;
  whatsapp: string;
  email?: string;
}

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  service: Service;
}

// --- Área administrativa ---
export type UserRole = 'ADMIN' | 'RECEPTION';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface AdminService {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  active: boolean;
  featured: boolean;
  sortOrder: number;
  services: AdminService[];
}

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface AdminAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  customer: { name: string; whatsapp: string };
  service: { id: string; name: string; durationMinutes: number };
}

// --- Financeiro & Estoque ---
export type ExpenseCategory = 'PRODUTOS' | 'EQUIPAMENTOS' | 'ALUGUEL' | 'MARKETING' | 'SALARIOS' | 'OUTROS';
export type ExpenseStatus = 'PENDING' | 'PAID';

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  status: ExpenseStatus;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

export type BankTransactionStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED';

export interface BankTransaction {
  id: string;
  fitId: string;
  postedAt: string;
  amountCents: number;
  description: string;
  memo: string | null;
  status: BankTransactionStatus;
  matchedExpenseId: string | null;
  matchedExpense: Expense | null;
  importedAt: string;
}

export interface TodaySummary {
  vencimentosHojeCents: number;
  vencimentosHoje: Expense[];
  recebimentosHojeCents: number;
  recebimentosHoje: { id: string; startAt: string; customerName: string; serviceName: string; amountCents: number }[];
}

export interface DailyRevenueHistory {
  days: { date: string; totalCents: number }[];
  totalCents: number;
  averageCents: number;
  averageAllDaysCents: number;
  activeDays: number;
}

export interface DreReport {
  periodFrom: string;
  periodTo: string;
  revenueCents: number;
  expensesByCategory: { category: ExpenseCategory; label: string; totalCents: number }[];
  totalExpensesCents: number;
  netResultCents: number;
  marginPct: number | null;
}

// --- Auditoria ---
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  method: string;
  path: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogList {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  entityTypes: string[];
  users: { userId: string; userName: string }[];
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  costCents: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  appointmentsToday: number;
  appointmentsThisMonth: number;
  appointmentStatusBreakdown: { status: AppointmentStatus; count: number }[];
  appointmentsPerDay: { date: string; count: number }[];
  revenueThisMonthCents: number;
  expensesThisMonthCents: number;
  balanceThisMonthCents: number;
  revenueChangePct: number | null;
  expensesChangePct: number | null;
  avgTicketCents: number;
  completionRatePct: number | null;
  noShowRatePct: number | null;
  expensesByCategory: { category: ExpenseCategory; totalCents: number }[];
  lowStockItems: { id: string; name: string; quantity: number; minQuantity: number; unit: string }[];
  lowStockCount: number;
  upcomingAppointments: { id: string; startAt: string; customerName: string; serviceName: string }[];
  topServices: { id: string; name: string; count: number }[];
}
