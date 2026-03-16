import { MOCK_DEALS, MOCK_USER } from './mockData'

// Simulate network delay for realism
const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))

export const mockApi = {

  // Auth
  async login(email: string, password: string) {
    await delay(800)
    return {
      success: true,
      token: "mock-jwt-token-12345",
      user: MOCK_USER
    }
  },

  async getMe() {
    await delay(200)
    return MOCK_USER
  },

  // Deals
  async getDeals(dateFrom?: string, dateTo?: string) {
    await delay(600)
    const today = new Date().toISOString().split('T')[0]
    const filterDate = dateFrom || today

    const scheduled = MOCK_DEALS.filter(d => {
      if (!d.scheduledDate) return false
      return d.scheduledDate.startsWith(filterDate)
    })

    const unscheduled = MOCK_DEALS.filter(
      d => !d.scheduledDate
    )

    return {
      scheduled,
      unscheduled,
      total_in_bitrix: MOCK_DEALS.length
    }
  },

  async getDeal(dealId: string) {
    await delay(400)
    const deal = MOCK_DEALS.find(d => d.id === dealId)
    if (!deal) throw new Error("Deal not found")
    return deal
  },

  async scheduleDeal(
    dealId: string,
    date: string,
    time: string
  ) {
    await new Promise(resolve => setTimeout(resolve, 500))
    // In mock mode just return success
    return {
      success: true,
      scheduled_date: `${date}T${time}:00`,
      stage: "Ustalone oględziny"
    }
  },

  // Inspection steps
  async saveStep(
    dealId: string,
    step: number,
    data: any
  ) {
    await delay(300)
    console.log(
      `[MOCK] Saved step ${step} for deal ${dealId}:`,
      data
    )
    return { success: true, deal_id: dealId }
  },

  async submitInspection(dealId: string, data: any) {
    await delay(1500)
    console.log(
      `[MOCK] Submitted inspection for deal ${dealId}`
    )
    return {
      success: true,
      deal_id: dealId,
      message: "Inspekcja zapisana pomyślnie"
    }
  },

  // Files
  async uploadFile(
    dealId: string,
    fieldKey: string,
    file: File
  ) {
    await delay(1000)
    // Return a fake URL
    return {
      success: true,
      file_id: `mock-file-${Date.now()}`,
      url: URL.createObjectURL(file)
    }
  },

  // Metadata
  async getMetadataOptions() {
    await delay(100)
    return {
      vehicle_brands: [
        "Alfa Romeo", "Audi", "BMW", "Chevrolet",
        "Citroën", "Dacia", "Fiat", "Ford", "Honda",
        "Hyundai", "Jeep", "Kia", "Lexus", "Mazda",
        "Mercedes-Benz", "Mitsubishi", "Nissan",
        "Opel", "Peugeot", "Porsche", "Renault",
        "Seat", "Skoda", "Subaru", "Suzuki",
        "Tesla", "Toyota", "Volkswagen", "Volvo"
      ],
      tire_brands: [
        "Bridgestone", "Continental", "Dunlop",
        "Falken", "Firestone", "Goodyear", "Hankook",
        "Kleber", "Kumho", "Michelin", "Nexen",
        "Nokian", "Pirelli", "Uniroyal",
        "Vredestein", "Yokohama", "Inne"
      ],
      fuel_types: [
        "BENZYNA", "DIESEL", "LPG", "HYBRYDA",
        "ELEKTRYCZNY", "HYBRYDA PLUG-IN", "INNE"
      ],
      body_types: [
        "HATCHBACK", "SEDAN", "KOMBI", "SUV",
        "COUPE", "CABRIO", "VAN/MINIVAN", "PICKUP"
      ],
      gearbox_types: [
        "MANUALNA", "AUTOMATYCZNA", "CVT",
        "DSG/DCT"
      ],
      drive_types: ["4x4", "4x2"],
      colors: [
        "Biały", "Czarny", "Szary", "Srebrny",
        "Czerwony", "Niebieski", "Zielony",
        "Żółty", "Pomarańczowy", "Brązowy",
        "Bordowy", "Inny"
      ]
    }
  }
}
