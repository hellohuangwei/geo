import apiClient from './client'

export interface ProductProfile {
  id: number
  userId: number
  productName: string | null
  keyFeatures: string | null
  advantages: string | null
  applicableScenarios: string | null
  caseStudies: string | null
  createTime: string | null
  updateTime: string | null
}

export async function fetchProductProfilesApi(): Promise<ProductProfile[]> {
  const res = await apiClient.get<ProductProfile[]>('/product-profiles')
  return res.data as ProductProfile[]
}

export async function createProductProfileApi(data: Record<string, string>): Promise<ProductProfile> {
  const res = await apiClient.post<ProductProfile>('/product-profiles', data)
  return res.data as ProductProfile
}

export async function fetchProductProfileApi(id: number): Promise<ProductProfile> {
  const res = await apiClient.get<ProductProfile>(`/product-profiles/${id}`)
  return res.data as ProductProfile
}

export async function updateProductProfileApi(id: number, data: Record<string, string>): Promise<ProductProfile> {
  const res = await apiClient.put<ProductProfile>(`/product-profiles/${id}`, data)
  return res.data as ProductProfile
}

export async function deleteProductProfileApi(id: number): Promise<void> {
  await apiClient.delete(`/product-profiles/${id}`)
}
