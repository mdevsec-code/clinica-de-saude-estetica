import type { PublicSettings, ServiceCategory } from '@/types';

// Dados reais da clínica, usados como fallback quando a API não responde
// (backend/banco ainda em configuração, ou instabilidade de rede). Não são
// dados inventados: são exatamente os mesmos valores já cadastrados no seed
// do banco (server/prisma/seed.ts) — isso garante que o site público nunca
// fique com seções essenciais (WhatsApp, endereço, horário, especialidades)
// vazias só porque a API está temporariamente indisponível. Assim que a API
// responde, os componentes substituem isso pelos dados ao vivo normalmente.
export const FALLBACK_SETTINGS: PublicSettings = {
  whatsapp: '5571992894874',
  instagram: '@noelycerqueira',
  email: 'noelydesouzacerqueiradossantos@gmail.com',
  address: 'Rua Vênus, 1, Gravatá, Camaçari, Bahia',
  addressMapUrl: null,
  businessHours: [
    { weekday: 2, opensAt: '09:00', closesAt: '17:00' },
    { weekday: 3, opensAt: '09:00', closesAt: '17:00' },
    { weekday: 4, opensAt: '09:00', closesAt: '17:00' },
    { weekday: 5, opensAt: '09:00', closesAt: '17:00' },
    { weekday: 6, opensAt: '08:00', closesAt: '12:00' },
  ],
};

export const FALLBACK_CATEGORIES: ServiceCategory[] = [
  {
    id: 'fallback-harmonizacao-facial',
    name: 'Harmonização Facial',
    slug: 'harmonizacao-facial',
    imageUrl: '/services/harmonizacao-facial.jpg',
    featured: true,
    services: [],
  },
  {
    id: 'fallback-harmonizacao-corporal',
    name: 'Harmonização Corporal',
    slug: 'harmonizacao-corporal',
    imageUrl: '/services/harmonizacao-corporal.jpg',
    featured: false,
    services: [],
  },
  {
    id: 'fallback-sobrancelha',
    name: 'Sobrancelha',
    slug: 'sobrancelha',
    imageUrl: '/services/sobrancelha.jpg',
    featured: false,
    services: [],
  },
  {
    id: 'fallback-limpeza-de-pele',
    name: 'Limpeza de Pele',
    slug: 'limpeza-de-pele',
    imageUrl: '/services/limpeza-de-pele.jpg',
    featured: false,
    services: [],
  },
  {
    id: 'fallback-depilacao',
    name: 'Depilação',
    slug: 'depilacao',
    imageUrl: '/services/depilacao.jpg',
    featured: false,
    services: [],
  },
  {
    id: 'fallback-massagens-terapias-corporais',
    name: 'Massagens e Terapias Corporais',
    slug: 'massagens-terapias-corporais',
    imageUrl: '/services/massagens-terapias-corporais.jpg',
    featured: false,
    services: [],
  },
  {
    id: 'fallback-micropigmentacao',
    name: 'Micropigmentação',
    slug: 'micropigmentacao',
    imageUrl: '/services/micropigmentacao.jpg',
    featured: false,
    services: [],
  },
  {
    id: 'fallback-nutricao',
    name: 'Nutrição',
    slug: 'nutricao',
    imageUrl: '/services/nutricao.jpg',
    featured: false,
    services: [],
  },
];
