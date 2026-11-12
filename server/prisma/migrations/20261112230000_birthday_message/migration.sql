-- Mensagem automática de aniversário.
ALTER TYPE "MessageTemplateKey" ADD VALUE 'BIRTHDAY';
ALTER TABLE "Customer" ADD COLUMN "birthdayMessageYear" INTEGER;
