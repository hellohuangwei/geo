import apiClient from './client'

export interface BrandProfile {
  id: number
  userId: number
  brandName: string | null
  brandAliases: string | null
  industry: string | null
  serviceArea: string | null
  description: string | null
  targetCustomers: string | null
  qualifications: string | null
  painPoints: string | null
  website: string | null
  competitors: string | null
  createTime: string | null
  updateTime: string | null
}

export async function fetchBrandProfileApi(): Promise<BrandProfile> {
  const res = await apiClient.get<BrandProfile>('/brand-profile')
  return res.data as BrandProfile
}

export async function updateBrandProfileApi(data: Record<string, string>): Promise<BrandProfile> {
  const res = await apiClient.put<BrandProfile>('/brand-profile', data)
  return res.data as BrandProfile
}

export async function deleteBrandProfileApi(): Promise<void> {
  await apiClient.delete('/brand-profile')
}
