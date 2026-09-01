// Funções puras de grade de calendário — sem dependência de Vue, fáceis de
// raciocinar isoladamente. Tudo em data local (NUNCA toISOString/UTC): o
// mesmo cuidado já aplicado em BookingView.vue, aqui ainda mais importante
// porque o "dia" de uma célula do calendário é definido pelo fuso da
// clínica/visitante, não por UTC.
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export interface CalendarDay {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
}

function buildDay(date: Date, isCurrentMonth: boolean, todayKey: string): CalendarDay {
  const dateKey = toLocalDateKey(date);
  return { date, dateKey, isCurrentMonth, isToday: dateKey === todayKey };
}

// Grade de mês completa, sempre em semanas cheias (domingo a sábado) —
// inclui os dias de padding do mês anterior/seguinte para fechar a primeira
// e a última semana, marcados com isCurrentMonth:false para exibição
// esmaecida.
export function buildMonthGrid(year: number, month: number): CalendarDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startWeekday = firstOfMonth.getDay();
  const endWeekday = lastOfMonth.getDay();
  const daysAfter = 6 - endWeekday;
  const totalDays = startWeekday + lastOfMonth.getDate() + daysAfter;

  const gridStart = new Date(year, month, 1 - startWeekday);
  const todayKey = toLocalDateKey(new Date());

  const days: CalendarDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    days.push(buildDay(date, date.getMonth() === month, todayKey));
  }
  return days;
}

// Semana (domingo a sábado) contendo referenceDate.
export function buildWeekGrid(referenceDate: Date): CalendarDay[] {
  const startWeekday = referenceDate.getDay();
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - startWeekday,
  );
  const todayKey = toLocalDateKey(new Date());

  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    days.push(buildDay(date, true, todayKey));
  }
  return days;
}

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function monthLabel(date: Date): string {
  return `${MONTH_LABELS[date.getMonth()]} de ${date.getFullYear()}`;
}

export function weekRangeLabel(days: CalendarDay[]): string {
  if (!days.length) return '';
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const sameMonth = first.getMonth() === last.getMonth();
  const firstLabel = `${first.getDate()}`;
  const lastLabel = sameMonth
    ? `${last.getDate()} de ${MONTH_LABELS[last.getMonth()]}`
    : `${last.getDate()} de ${MONTH_LABELS[last.getMonth()]}`;
  return `${firstLabel} — ${lastLabel} de ${last.getFullYear()}`;
}

export function dayLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}
