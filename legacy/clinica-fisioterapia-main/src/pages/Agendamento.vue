<template>
  <v-app>
    <v-app-bar color="primary" dark app>
      <v-toolbar-title>
        <v-icon left>mdi-hospital</v-icon> Clínica Vida+
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn text to="/">Home</v-btn>
      <v-btn text to="/agendamento">Agendamento</v-btn>
      <v-btn text to="/contato">Contato</v-btn>
    </v-app-bar>

    <v-main class="pa-4">
      <v-container>
        <v-form v-model="valido" ref="formRef" @submit.prevent="submitForm">
          <v-text-field label="Nome" v-model="form.nome" required></v-text-field>
          <v-text-field label="Email" v-model="form.email" required type="email"></v-text-field>
          <v-text-field label="Telefone" v-model="form.telefone" required></v-text-field>
          <v-textarea label="Mensagem" v-model="form.mensagem" required></v-textarea>

          <v-btn color="primary" type="submit" :disabled="!valido">
            Enviar
          </v-btn>
        </v-form>

        <v-snackbar v-model="snackbar" timeout="3000" color="success">
          Mensagem enviada com sucesso!
        </v-snackbar>
      </v-container>
    </v-main>

    <v-footer color="primary" dark app>
      <v-col class="text-center">
        © 2025 Clínica Vida+. Todos os direitos reservados.
        <v-btn icon href="https://instagram.com" target="_blank"><v-icon>mdi-instagram</v-icon></v-btn>
        <v-btn icon href="https://wa.me/5599999999999" target="_blank"><v-icon>mdi-whatsapp</v-icon></v-btn>
      </v-col>
    </v-footer>
  </v-app>
</template>

<script setup>
import { ref } from 'vue'
import emailjs from '@emailjs/browser'

const form = ref({
  nome: '',
  email: '',
  telefone: '',
  mensagem: ''
})

const valido = ref(false)
const snackbar = ref(false)
const formRef = ref(null)

function submitForm() {
  const templateParams = {
    nome: form.value.nome,
    email: form.value.email,
    telefone: form.value.telefone,
    mensagem: form.value.mensagem
  }

  emailjs
    .send(
      'service_vavdly7',
      'template_lugg2jw',
      templateParams,
      'JYzpTzNtaNSIWSjF8'
    )
    .then(() => {
      snackbar.value = true
      formRef.value.reset()
    })  
    .catch((error) => {
      console.error('Erro ao enviar e-mail:', error)
    })
}
</script>

<style scoped>
.v-container {
  max-width: 600px;
  margin: 0 auto;
  padding-top: 40px;
}
</style>