import { prisma } from '../../lib/prisma';

export async function getPublicSettings(tenantId: string) {
  const [settings, businessHours] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
    prisma.businessHour.findMany({
      where: { tenantId, active: true },
      orderBy: { weekday: 'asc' },
    }),
  ]);

  return {
    whatsapp: settings?.whatsapp ?? null,
    instagram: settings?.instagram ?? null,
    email: settings?.email ?? null,
    address: settings?.address ?? null,
    addressMapUrl: settings?.addressMapUrl ?? null,
    businessHours: businessHours.map((bh) => ({
      weekday: bh.weekday,
      opensAt: bh.opensAt,
      closesAt: bh.closesAt,
    })),
  };
}
