// Junta pacientes duplicadas (o mesmo celular cadastrado mais de uma vez,
// em formatos diferentes: com/sem 55, com/sem o 9º dígito, com máscara).
//
//   node dist/scripts/merge-duplicate-customers.js           → só mostra (não muda nada)
//   node dist/scripts/merge-duplicate-customers.js --apply   → junta de verdade
//   ... --only-same-name   → só grupos em que o primeiro nome bate (o mesmo
//   celular com nomes diferentes pode ser mãe e filha dividindo o WhatsApp:
//   esses ficam para conferir à mão).
//
// Fica o cadastro com mais histórico (atendimentos + procedimentos + fichas
// + fotos); empate → o mais antigo. Tudo das duplicadas (agendamentos,
// procedimentos, fotos, retornos, fichas) passa para ele, campos vazios dele
// são completados com os das duplicadas, e as duplicadas são apagadas — por
// grupo, numa transação. A saída não mostra nome nem telefone (só ids e
// contagens): é dado de paciente.
import { prisma } from '../lib/prisma';
import { phoneKey } from '../modules/whatsapp/whatsapp-connection';

const apply = process.argv.includes('--apply');
const onlySameName = process.argv.includes('--only-same-name');
const firstName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0];

async function main() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { appointments: true, procedureRecords: true, fichas: true, photos: true, returnReminders: true } } },
  });

  const groups = new Map<string, typeof customers>();
  for (const c of customers) {
    const digits = c.whatsapp.replace(/\D/g, '');
    if (digits.length < 10) continue; // número incompleto: não dá para comparar com segurança
    const key = `${c.tenantId}:${phoneKey(c.whatsapp)}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);

  const history = (c: (typeof customers)[number]) =>
    c._count.appointments + c._count.procedureRecords + c._count.fichas + c._count.photos;

  console.log(`${customers.length} cadastros · ${dupGroups.length} pacientes com duplicata · ${dupGroups.reduce((s, g) => s + g.length - 1, 0)} cadastros a juntar`);
  console.log(apply ? 'MODO: juntando de verdade' : 'MODO: simulação (nada é alterado; use --apply)');

  for (const group of dupGroups) {
    if (onlySameName && new Set(group.map((c) => firstName(c.name))).size > 1) {
      console.log(`- PULADO (nomes diferentes, conferir à mão): ${group.map((c) => c.id).join(', ')}`);
      continue;
    }
    const sorted = [...group].sort((a, b) => history(b) - history(a) || a.createdAt.getTime() - b.createdAt.getTime());
    const [keep, ...dups] = sorted;
    console.log(
      `- fica ${keep.id} (${keep._count.appointments} atend., ${keep._count.procedureRecords} proced.) ← junta ${dups
        .map((d) => `${d.id} (${d._count.appointments} atend., ${d._count.procedureRecords} proced.)`)
        .join(', ')}`,
    );
    if (!apply) continue;

    const dupIds = dups.map((d) => d.id);
    await prisma.$transaction(async (tx) => {
      await tx.appointment.updateMany({ where: { customerId: { in: dupIds } }, data: { customerId: keep.id } });
      await tx.procedureRecord.updateMany({ where: { customerId: { in: dupIds } }, data: { customerId: keep.id } });
      await tx.patientPhoto.updateMany({ where: { customerId: { in: dupIds } }, data: { customerId: keep.id } });
      await tx.returnReminder.updateMany({ where: { customerId: { in: dupIds } }, data: { customerId: keep.id } });
      await tx.patientFicha.updateMany({ where: { customerId: { in: dupIds } }, data: { customerId: keep.id } });
      // Completa o que o cadastro que fica não tem (nunca sobrescreve).
      const pick = <K extends 'email' | 'phone' | 'birthDate' | 'profilePhotoUrl' | 'notes'>(field: K) =>
        keep[field] ?? dups.find((d) => d[field] != null)?.[field] ?? null;
      const notes = [keep.notes, ...dups.map((d) => d.notes)].filter(Boolean);
      await tx.customer.update({
        where: { id: keep.id },
        data: {
          email: pick('email'),
          phone: pick('phone'),
          birthDate: pick('birthDate'),
          profilePhotoUrl: pick('profilePhotoUrl'),
          notes: notes.length ? [...new Set(notes)].join('\n') : null,
        },
      });
      await tx.customer.deleteMany({ where: { id: { in: dupIds } } });
    });
  }
  console.log(apply ? 'Pronto.' : 'Simulação terminada.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
