import { motion, useReducedMotion } from "motion/react";
import { BarChart3, Boxes, Fingerprint, Waves } from "lucide-react";

const signals = [
  { icon: Boxes, value: "Данные", label: "контур и научные входы" },
  {
    icon: BarChart3,
    value: "Метод",
    label: "параметры и версия ядра",
  },
  {
    icon: Fingerprint,
    value: "Результат",
    label: "метрики, изображения и файлы",
  },
];

export function ProjectPulse() {
  const reduceMotion = useReducedMotion();
  return (
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch">
      <div className="relative overflow-hidden rounded-2xl border bg-card p-6 text-card-foreground sm:p-8">
        <div
          aria-hidden="true"
          className="absolute -right-20 -bottom-24 size-64 rounded-full border border-dashed border-primary/20 motion-safe:animate-[spin_24s_linear_infinite]"
        />
        <div className="relative">
          <div className="mb-8 flex items-center gap-2 text-primary">
            <Waves className="size-4" /> Исследовательский маршрут
          </div>
          <p className="font-mono text-sm leading-7 text-muted-foreground">
            От вопроса к результату
          </p>
          <div className="mt-5 space-y-3 font-mono text-sm">
            <p className="text-primary">01 / Подготовить входные данные</p>
            <p className="text-primary">02 / Выбрать научный сценарий</p>
            <p className="text-primary">03 / Запустить расчёт</p>
            <p className="text-foreground">04 / Проверить результат</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border bg-muted/20 p-5 sm:p-8">
        <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
          След расчёта
        </p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
          К результату можно вернуться
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          В личном кабинете остаются история заданий, параметры, версия ядра,
          метрики и файлы. Они помогают понять, как был получен результат, и
          сравнить совместимые расчёты.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {signals.map((signal) => {
            const Icon = signal.icon;
            return (
              <motion.div
                key={signal.value}
                whileHover={reduceMotion ? undefined : { y: -4 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="rounded-xl border bg-background p-4"
              >
                <Icon className="mb-5 size-5 text-primary" />
                <strong className="block text-lg">{signal.value}</strong>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {signal.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
