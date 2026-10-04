import { Database, Expand, Images, Presentation, X } from "lucide-react";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/shadcn/components/ui/dialog";
import { Hero } from "@/shared/ui/hero";

const results = [
  {
    src: "/gallery/bathymetry-overview.svg",
    title: "Обзор батиметрии",
    type: "SVG",
    category: "Рельеф",
  },
  {
    src: "/gallery/adaptive-size-field.svg",
    title: "Адаптивное поле размеров",
    type: "SVG",
    category: "Сетки",
  },
  {
    src: "/gallery/black-sea-seabed-3d.svg",
    title: "Фактическая сетка Чёрного моря",
    type: "SVG",
    category: "Контрольная модель",
  },
  {
    src: "/gallery/black-sea-mesh-details.svg",
    title: "Контрольные фрагменты сетки",
    type: "SVG",
    category: "Контрольная модель",
  },
  {
    src: "/gallery/E-007.svg",
    title: "Карточка E-007",
    type: "SVG",
    category: "Экспертный набор",
  },
  {
    src: "/gallery/E-009.svg",
    title: "Карточка E-009",
    type: "SVG",
    category: "Экспертный набор",
  },
  {
    src: "/gallery/erosion-step-0.svg",
    title: "Эрозия · начальное состояние",
    type: "SVG",
    category: "Динамика",
  },
  {
    src: "/gallery/erosion-step-3.svg",
    title: "Эрозия · шаг 3",
    type: "SVG",
    category: "Динамика",
  },
  {
    src: "/gallery/lithology-map.png",
    title: "Карта литологии",
    type: "PNG",
    category: "Материалы",
  },
  {
    src: "/gallery/dynamics.png",
    title: "Временная динамика",
    type: "PNG",
    category: "Динамика",
  },
  {
    src: "/gallery/sediment-budget.png",
    title: "Баланс наносов",
    type: "PNG",
    category: "Метрики",
  },
];

export function GalleryPage() {
  return (
    <div className="space-y-10">
      <Hero
        title="Галерея результатов"
        subtitle="Как Litora видит прибрежную систему"
      />
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] p-5">
        <Images
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-primary"
        />
        <p className="text-sm leading-6 text-muted-foreground">
          Реальные карты, сетки и отчёты, собранные CLI в научных сценариях.
          Нажмите на карточку, чтобы рассмотреть результат.
        </p>
      </div>
      <section className="rounded-2xl border bg-background p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Database
            aria-hidden="true"
            className="mt-1 size-5 shrink-0 text-primary"
          />
          <div>
            <h2 className="text-xl font-bold">
              Паспорт объекта · фактическая сетка Чёрного моря
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Контрольная батиметрическая модель на основе EMODnet DTM 2024.
              Ниже собраны её визуальный рельеф, контрольные фрагменты и
              экспертные карточки.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-muted/40 p-3">
            <dt className="text-muted-foreground">Разрешение</dt>
            <dd className="mt-1 font-semibold">2,2 км</dd>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <dt className="text-muted-foreground">Проекция</dt>
            <dd className="mt-1 font-semibold">LAEA, метры</dd>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <dt className="text-muted-foreground">
              Вертикальная неопределённость
            </dt>
            <dd className="mt-1 font-semibold">15 м</dd>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <dt className="text-muted-foreground">Класс валидации</dt>
            <dd className="mt-1 font-semibold">Межпродуктовый контроль</dd>
          </div>
        </dl>
        <a
          href="/gallery/black-sea-object-passport.json"
          download
          className="mt-5 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Скачать полный JSON-паспорт объекта
        </a>
      </section>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => (
          <Dialog key={result.src}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="group h-auto min-w-0 flex-col items-stretch overflow-hidden rounded-2xl p-0 text-left whitespace-normal shadow-sm hover:border-primary/50 hover:shadow-lg"
              >
                <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/30 p-3">
                  <img
                    src={result.src}
                    alt=""
                    loading="lazy"
                    className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
                  />
                </span>
                <span className="flex items-center justify-between gap-3 p-4">
                  <span className="min-w-0">
                    <span className="block text-xs text-primary">
                      {result.category} · {result.type}
                    </span>
                    <span className="mt-1 block font-semibold break-words">
                      {result.title}
                    </span>
                  </span>
                  <Expand
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl overflow-y-auto p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle>{result.title}</DialogTitle>
                  <DialogDescription>
                    {result.category} · {result.type}. Увеличенный просмотр
                    изображения из галереи.
                  </DialogDescription>
                </div>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Закрыть просмотр"
                    className="size-11"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </DialogClose>
              </div>
              <img
                src={result.src}
                alt={result.title}
                className="max-h-[75dvh] w-full object-contain"
              />
            </DialogContent>
          </Dialog>
        ))}
      </div>

      <section className="rounded-2xl border border-dashed p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <Presentation
            aria-hidden="true"
            className="size-6 shrink-0 text-primary"
          />
          <div>
            <h2 className="text-xl font-bold">Презентации проекта</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Здесь появится интерактивный просмотр презентаций: научный
              контекст, методика, результаты экспериментов и развитие Litora.
            </p>
            <span className="mt-4 inline-flex rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              Скоро
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
