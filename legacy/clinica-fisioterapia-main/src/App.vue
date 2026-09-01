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
      <router-view />
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
</script>
