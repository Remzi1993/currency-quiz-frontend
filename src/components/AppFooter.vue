<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { projectLinks } from '../projectLinks.ts'

const repositories = [
  {
    title: 'API contract',
    name: 'currency-quiz-shared',
    icon: 'book',
    href: projectLinks.contract,
    description: 'The OpenAPI specification and generated types that keep the backend and its clients speaking the same language.',
  },
  {
    title: 'Backend',
    name: 'currency-quiz-backend',
    icon: 'flag',
    href: projectLinks.backend,
    description: 'The Kotlin and Ktor REST API behind the quiz. It serves currency questions, checks answers, and manages the question bank.',
  },
  {
    title: 'Frontend',
    name: 'currency-quiz-frontend',
    icon: 'globe',
    href: projectLinks.frontend,
    description: 'The Vue, TypeScript, and Bulma app you’re using. Play a quiz, save your progress, and explore the API documentation.',
  },
] as const
</script>

<template>
  <footer class="footer project-footer" aria-labelledby="footer-heading">
    <div class="footer-introduction">
      <div>
        <p class="eyebrow">CURRENCY QUIZ · MADE TO BE SHARED</p>
        <h2 id="footer-heading">A little curiosity.<br /><em>A lot to share.</em></h2>
        <p class="footer-description">An experimental school project, open from end to end. The API contract, backend, and frontend are all open source under the MIT License.</p>
      </div>
      <a class="footer-license" :href="`${projectLinks.frontend}/blob/main/LICENSE`" target="_blank" rel="noopener">
        <AppIcon name="spark" /><span>OPEN SOURCE<strong>MIT License</strong></span><AppIcon name="arrow" />
      </a>
    </div>

    <section class="footer-repositories" aria-labelledby="repositories-heading">
      <h3 id="repositories-heading" class="eyebrow">THREE REPOSITORIES. ONE PROJECT.</h3>
      <div class="repository-grid">
        <article v-for="repository in repositories" :key="repository.name" class="repository-card">
          <span class="repository-icon"><AppIcon :name="repository.icon" /></span>
          <h4>{{ repository.title }}</h4>
          <p>{{ repository.description }}</p>
          <a :href="repository.href" target="_blank" rel="noopener">{{ repository.name }}<AppIcon name="arrow" /></a>
        </article>
      </div>
    </section>

    <div class="footer-details">
      <section class="footer-about" aria-labelledby="about-heading">
        <p class="eyebrow">BEHIND THE PROJECT</p>
        <h3 id="about-heading">Hi, I’m Remzi Çavdar</h3>
        <p>I’m an HBO-ICT Software Engineering student at the Amsterdam University of Applied Sciences (HvA). I built Currency Quiz to experiment, deepen my backend knowledge, and demonstrate my full stack development skills.</p>
        <a class="footer-text-link" href="https://remzi.info" target="_blank" rel="noopener">More about me at remzi.info <AppIcon name="arrow" /></a>
      </section>
      <section class="footer-contact" aria-labelledby="contact-heading">
        <p class="eyebrow">SAY HELLO</p>
        <h3 id="contact-heading">Let’s connect.</h3>
        <address>
          <span>Remzi Çavdar</span>
          <a href="mailto:remzi.cavdar@hva.nl">remzi.cavdar@hva.nl</a>
          <a href="mailto:ict@remzi.info">ict@remzi.info</a>
        </address>
        <p class="footer-student">Student number <span>500714645</span></p>
      </section>
    </div>

    <div class="footer-bottom">
      <p>Built to learn. Shared to build on.</p>
      <nav aria-label="Project resources">
        <RouterLink to="/documentation">API documentation</RouterLink>
        <a :href="projectLinks.openApiSpec" target="_blank" rel="noopener">OpenAPI specification <AppIcon name="arrow" /></a>
        <a :href="`${projectLinks.frontend}/blob/main/LICENSE`" target="_blank" rel="noopener">MIT License <AppIcon name="arrow" /></a>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.project-footer.footer {
  margin-block: 42px 24px;
  padding: 48px 44px 24px;
  border-radius: 20px;
  background: #183e31;
  color: #c0d0bd;
}

.project-footer .eyebrow { color: #b6cba5; font-size: 9px; letter-spacing: 1.4px; }
.project-footer a { color: #e0edce; }
.project-footer a:hover { color: #fffefa; text-decoration: underline; text-underline-offset: 4px; }
.project-footer a:focus-visible { outline-color: #c0db9f; }
.footer-introduction { display: flex; align-items: flex-start; justify-content: space-between; gap: 36px; }
.footer-introduction h2 { margin-top: 18px; color: #fffefa; font-size: clamp(36px, 4vw, 54px); font-weight: 500; line-height: 1.15; letter-spacing: -1.8px; }
.footer-introduction h2 em { color: #d4e5b9; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; }
.footer-description { max-width: 580px; margin-top: 22px; font-size: 14px; line-height: 1.9; }
.footer-license { display: flex; flex: none; align-items: center; gap: 12px; margin-top: 8px; padding: 16px 20px; border: 1px solid #678064; border-radius: 12px; background: #254b3b; }
.footer-license > .app-icon:first-child { width: 28px; height: 28px; color: #c7dda9; }
.footer-license > .app-icon:last-child { width: 16px; height: 16px; margin-left: 12px; }
.footer-license > span { color: #b6cba5; font-size: 8px; line-height: 1.6; letter-spacing: 1.3px; }
.footer-license strong { display: block; color: #f4f7e9; font-size: 15px; font-weight: 500; letter-spacing: 0; }
.footer-repositories { margin-top: 44px; }
.repository-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
.repository-card { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; padding: 24px; border: 1px solid #47634f; border-radius: 12px; background: #204536; }
.repository-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: #32563f; color: #d0e3b5; }
.repository-icon .app-icon { width: 19px; height: 19px; }
.repository-card h4 { margin-top: 20px; color: #f4f6e9; font-size: 18px; font-weight: 600; letter-spacing: -.4px; }
.repository-card p { margin-block: 12px 24px; font-size: 12px; line-height: 1.9; }
.repository-card > a { display: flex; align-items: center; gap: 8px; margin-top: auto; max-width: 100%; font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; }
.repository-card > a .app-icon { width: 15px; height: 15px; }
.footer-details { display: grid; grid-template-columns: 1.6fr 1fr; gap: 64px; margin-top: 40px; padding-block: 36px; border-top: 1px solid #47634f; }
.footer-details h3 { margin-top: 13px; color: #f4f6e9; font-size: 23px; font-weight: 500; letter-spacing: -.5px; }
.footer-about > p:not(.eyebrow) { max-width: 565px; margin-top: 16px; font-size: 13px; line-height: 1.9; }
.footer-text-link { display: inline-flex; align-items: center; gap: 9px; margin-top: 19px; font-size: 12px; }
.footer-text-link .app-icon { width: 16px; height: 16px; }
.footer-contact address { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 18px; font-style: normal; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.footer-contact address > span { color: #f4f6e9; }
.footer-student { margin-top: 17px; color: #b6cba5; font-size: 11px; }
.footer-student > span { margin-left: 10px; color: #e0edce; font-variant-numeric: tabular-nums; }
.footer-bottom { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-top: 22px; border-top: 1px solid #47634f; font-size: 10px; line-height: 1.8; }
.footer-bottom nav { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 24px; }
.footer-bottom nav a { display: inline-flex; align-items: center; gap: 5px; }
.footer-bottom .app-icon { width: 12px; height: 12px; }

@media (max-width: 1100px) {
  .project-footer.footer { padding-inline: 30px; }
  .repository-card { padding: 20px; }
  .footer-details { gap: 36px; }
  .footer-bottom { align-items: flex-start; flex-direction: column; gap: 14px; }
}

@media (max-width: 800px) {
  .project-footer.footer { margin-top: 28px; padding: 32px 24px 24px; border-radius: 15px; }
  .footer-introduction { flex-direction: column; gap: 24px; }
  .footer-introduction h2 { font-size: 39px; }
  .footer-description { font-size: 13px; }
  .footer-license { margin-top: 0; padding: 12px 16px; }
  .footer-repositories { margin-top: 32px; }
  .repository-grid { grid-template-columns: 1fr; gap: 12px; }
  .repository-card h4 { margin-top: 15px; }
  .repository-card p { margin-bottom: 19px; }
  .footer-details { grid-template-columns: 1fr; gap: 32px; margin-top: 32px; padding-block: 30px; }
  .footer-bottom nav { align-items: flex-start; flex-direction: column; gap: 12px; }
  .footer-bottom nav a { min-height: 32px; }
}

@media (max-width: 440px) {
  .project-footer.footer { padding-inline: 20px; }
  .footer-introduction h2 { font-size: 34px; letter-spacing: -1.4px; }
  .repository-card { padding: 20px 18px; }
}
</style>
