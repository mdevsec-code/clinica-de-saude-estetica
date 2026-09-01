<template>
  <v-container>
    <v-row justify="center" class="my-6">
      <v-col cols="12" md="8">
        <h1 class="text-h4 font-weight-bold mb-4">Bem-vindo à Clínica Vida+</h1>
        <p>Agende sua sessão de fisioterapia com conforto e rapidez.</p>
      </v-col>
    </v-row>

    <v-row justify="center">
      <v-col cols="12" md="4" v-for="servico in servicos" :key="servico.titulo">
        <v-card>
          <v-img :src="servico.imagem" height="200px"></v-img>
          <v-card-title>{{ servico.titulo }}</v-card-title>
          <v-card-text>{{ servico.descricao }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
const servicos = [
  {
    titulo: 'Fisioterapia Ortopédica',
    descricao: 'Tratamento pós-operatório e reabilitação de lesões ortopédicas.',
    imagem: 'https://blog.carcioficial.com.br/wp-content/uploads/2018/08/189797-conheca-os-principais-equipamentos-para-fisioterapia-domiciliar.jpg',
  },
  {
    titulo: 'Reabilitação Esportiva',
    descricao: 'Foco em atletas e entusiastas do esporte.',
    imagem: 'https://temastcc.com.br/wp-content/uploads/2022/02/jogardor-de-futebol-fisioterapia.jpg',
  },
  {
    titulo: 'Drenagem Linfática',
    descricao: 'Tratamento estético e terapêutico para retenção de líquidos.',
    imagem: 'https://th.bing.com/th/id/R.ad8b4c620ed4cd79ad38e77d0e6e379e?rik=Duwwzb98Z4ofdw&riu=http%3a%2f%2fwww.mutyestetikguzellik.com.tr%2fpictures%2fmuty-guzellik-ve-estetik-merkezi-GF0GE.jpg&ehk=GFMVUS1fOp%2fLdKhJnkPrVLVAiWy9vx%2bmvvdOL%2bLXnyk%3d&risl=&pid=ImgRaw&r=0',
  },
]
</script>
