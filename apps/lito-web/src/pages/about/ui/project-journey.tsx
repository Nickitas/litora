import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Compass, FileCheck2, Waves } from "lucide-react";
import { Link } from "react-router";

const milestones = [
  {
    icon: Compass,
    label: "01",
    title: "Описать форму",
    text: "Контур проходит геометрическую проверку и становится основой для измерений и анализа размерности.",
  },
  {
    icon: Waves,
    label: "02",
    title: "Изучить связи",
    text: "Модель дна, сетка и волновые условия задают разные вопросы о форме и изменении берега.",
  },
  {
    icon: FileCheck2,
    label: "03",
    title: "Проверить вывод",
    text: "Метрики, изображения и паспорта помогают сопоставить результат с исходными данными и допущениями.",
  },
];

export function ProjectJourney() {
  const reduceMotion = useReducedMotion();
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-background to-accent/60 p-5 sm:p-8">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
          Подход Litora
        </p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
          От линии на карте к исследовательскому вопросу
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Берег нельзя описать одним числом или рисунком. Litora предлагает
          несколько способов исследовать его форму, рельеф и динамику — и
          сохраняет основания для каждого вывода.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {milestones.map((milestone, index) => {
          const Icon = milestone.icon;
          return (
            <motion.article
              key={milestone.label}
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reduceMotion ? 0 : index * 0.15 }}
              className="group rounded-xl border bg-background/80 p-5 shadow-sm transition-colors hover:border-primary/50"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform motion-safe:group-hover:rotate-6">
                  <Icon className="size-5" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {milestone.label}
                </span>
              </div>
              <h3 className="text-lg font-semibold">{milestone.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {milestone.text}
              </p>
            </motion.article>
          );
        })}
      </div>
      <Link
        to="/gallery"
        className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:gap-3"
      >
        Посмотреть примеры результатов{" "}
        <ArrowRight className="size-4 transition-all" />
      </Link>
    </section>
  );
}
