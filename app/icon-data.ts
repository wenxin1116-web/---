// Built-in icon data intentionally starts empty. Administrators can upload icons from the UI.

export const categories = [
  "通用线性图标",
  "硬件线性图标",
  "清洁类图标",
  "产品品类图标",
  "新工厂大楼实验室标识",
  "硬件小图标",
  "线性+色块图标",
] as const;

export type IconCategory = string;
export type IconData = {
  id: string;
  name: string;
  category: IconCategory;
  tags: string[];
  svg: string;
};

export const icons: IconData[] = [];
