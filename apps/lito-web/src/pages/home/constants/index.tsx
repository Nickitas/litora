import type { ComponentType } from "react";
import {
  Compass as CompassIcon,
  RotateCw as RotateCwIcon,
  Waves as WavesIcon,
  Ruler as RulerIcon,
} from "lucide-react";

export interface TechBadge {
  label: string;
}

export interface FeatureCard {
  icon: ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
}

export const homePageContent = {
  hero: {
    title: "Litora",
    subtitle: "Лаборатория исследования прибрежных систем",
    description:
      "Исследуйте береговую линию и рельеф дна Чёрного моря: готовьте геоданные, стройте геометрические образы, запускайте расчёты и изучайте результаты.",
    badges: [
      { label: "Геометрия берега" },
      { label: "Батиметрия и сетки" },
      { label: "Динамика береговой линии" },
    ] as TechBadge[],
    ctaButtons: [
      { label: "В лабораторию", route: "/lab" as const },
      { label: "Скачать CLI", route: "/downloads" as const },
    ],
  },

  features: [
    {
      icon: CompassIcon,
      title: "Геометрия побережья",
      description:
        "Загружайте собственный контур, проверяйте его геометрию и исследуйте сложность береговой линии методом box-counting.",
    },
    {
      icon: RulerIcon,
      title: "Рельеф дна",
      description:
        "Стройте сетки и батиметрические модели, рассматривайте карты, профили и фрагменты рельефа.",
    },
    {
      icon: RotateCwIcon,
      title: "Прибрежные процессы",
      description:
        "Изучайте изменение берега и перенос наносов в сценариях CERC: на примере Сочи или со своими входными данными.",
    },
    {
      icon: WavesIcon,
      title: "Проверка результата",
      description:
        "Сопоставляйте расчёты, проверяйте качество моделей и возвращайтесь к параметрам, метрикам и файлам исследования.",
    },
  ] as FeatureCard[],

  scientificContext: {
    title: "От исходных данных к геометрическому образу",
    content: (strong: string) => (
      <>
        Litora связывает геометрию берега, батиметрию и расчётные сценарии с
        исходными данными, параметрами и результатами. Основа проекта —
        диссертационное исследование{" "}
        <strong className="text-foreground">{strong}</strong> на примере Чёрного
        моря. Модели помогают проверять исследовательские гипотезы; пригодность
        выводов зависит от качества входных данных и проверки метода.
      </>
    ),
    dissertationTitle: "«Построение геометрических образов прибрежных систем»",
  },
} as const;
