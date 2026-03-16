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
    await new Promise(r => setTimeout(r, 600))
    
    // Always use TODAY's date for scheduled deals
    const today = new Date().toISOString().split('T')[0]
    
    // Build deals with today's date dynamically
    const scheduled = [
      {
        id: "213",
        title: "Wycena - BMW X5 2022",
        type: "WYCENA",
        stage: "Ustalone oględziny",
        scheduledDate: `${today}T10:00:00`,
        registrationNumber: "KR 12345",
        vin: "WBA12345678901234",
        brand: "BMW",
        model: "X5",
        year: "2022",
        color: "Czarny",
        fuelType: "BENZYNA",
        bodyType: "SUV",
        gearboxType: "AUTOMATYCZNA",
        mileage: "45000",
        clientFirstName: "Marek",
        clientLastName: "Nowak",
        clientPhone: "+48 600 123 456",
        companyName: "Auto Handel Nowak Sp. z o.o.",
        ownerName: "Marek Nowak",
        location: "Kraków, ul. Floriańska 12",
        status: "scheduled"
      },
      {
        id: "214",
        title: "CFM - Toyota Corolla 2020",
        type: "CFM",
        stage: "Ustalone oględziny",
        scheduledDate: `${today}T13:00:00`,
        registrationNumber: "WA 98765",
        vin: "SB1K53AE90E123456",
        brand: "Toyota",
        model: "Corolla",
        year: "2020",
        color: "Srebrny",
        fuelType: "HYBRYDA",
        bodyType: "SEDAN",
        gearboxType: "CVT",
        mileage: "67000",
        clientFirstName: "Anna",
        clientLastName: "Wiśniewska",
        clientPhone: "+48 700 456 789",
        companyName: "Arval Care Service",
        ownerName: "Anna Wiśniewska",
        location: "Warszawa, ul. Marszałkowska 5",
        status: "scheduled"
      },
      {
        id: "217",
        title: "Wycena - Mercedes C-Class 2023",
        type: "WYCENA",
        stage: "Ustalone oględziny",
        scheduledDate: `${today}T15:30:00`,
        registrationNumber: "WR 22222",
        vin: "WDD2050341R123456",
        brand: "Mercedes-Benz",
        model: "C-Class",
        year: "2023",
        color: "Niebieski",
        fuelType: "BENZYNA",
        bodyType: "SEDAN",
        gearboxType: "AUTOMATYCZNA",
        mileage: "12000",
        clientFirstName: "Tomasz",
        clientLastName: "Adamski",
        clientPhone: "+48 502 345 678",
        companyName: "Mercedes Zasada",
        ownerName: "Tomasz Adamski",
        location: "Wrocław, ul. Świdnicka 3",
        status: "scheduled"
      }
    ]
    
    const unscheduled = [
      {
        id: "215",
        title: "Wycena - Volkswagen Passat 2019",
        type: "WYCENA",
        stage: "Nowe zlecenie",
        scheduledDate: null,
        registrationNumber: "PO 54321",
        vin: "WVWZZZ3CZKE123456",
        brand: "Volkswagen",
        model: "Passat",
        year: "2019",
        color: "Biały",
        fuelType: "DIESEL",
        bodyType: "KOMBI",
        gearboxType: "MANUALNA",
        mileage: "112000",
        clientFirstName: "Piotr",
        clientLastName: "Kowalczyk",
        clientPhone: "+48 500 789 123",
        companyName: "VW Financial",
        ownerName: "Piotr Kowalczyk",
        location: "Poznań, ul. Długa 8",
        status: "unscheduled"
      },
      {
        id: "216",
        title: "CFM - Audi A4 2021",
        type: "CFM",
        stage: "Nowe zlecenie",
        scheduledDate: null,
        registrationNumber: "GD 11111",
        vin: "WAUZZZ8V5MA123456",
        brand: "Audi",
        model: "A4",
        year: "2021",
        color: "Szary",
        fuelType: "DIESEL",
        bodyType: "SEDAN",
        gearboxType: "AUTOMATYCZNA",
        mileage: "38000",
        clientFirstName: "Katarzyna",
        clientLastName: "Zielińska",
        clientPhone: "+48 601 234 567",
        companyName: "Audi Select Plus",
        ownerName: "Katarzyna Zielińska",
        location: "Gdańsk, ul. Długa 15",
        status: "unscheduled"
      }
    ]
    
    return {
      scheduled,
      unscheduled,
      total_in_bitrix: scheduled.length + 
                       unscheduled.length
    }
  },

  async getDeal(dealId: string) {
    await delay(400)
    // Find in dynamic deals
    const today = new Date().toISOString().split('T')[0]
    const all = [
        { id: "213", companyName: "Auto Handel Nowak Sp. z o.o.", ownerName: "Marek Nowak", address: "Kraków, ul. Floriańska 12", scheduledDate: `${today}T10:00:00`, vin: "WBA12345678901234", plates: "KR 12345", brand: "BMW", model: "X5", year: 2022, mileage: 45000, clientName: "Marek Nowak" },
        { id: "214", companyName: "Arval Care Service", ownerName: "Anna Wiśniewska", address: "Warszawa, ul. Marszałkowska 5", scheduledDate: `${today}T13:00:00`, vin: "SB1K53AE90E123456", plates: "WA 98765", brand: "Toyota", model: "Corolla", year: 2020, mileage: 67000, clientName: "Anna Wiśniewska" },
        { id: "217", companyName: "Mercedes Zasada", ownerName: "Tomasz Adamski", address: "Wrocław, ul. Świdnicka 3", scheduledDate: `${today}T15:30:00`, vin: "WDD2050341R123456", plates: "WR 22222", brand: "Mercedes-Benz", model: "C-Class", year: 2023, mileage: 12000, clientName: "Tomasz Adamski" },
        { id: "215", companyName: "VW Financial", ownerName: "Piotr Kowalczyk", address: "Poznań, ul. Długa 8", scheduledDate: null, vin: "WVWZZZ3CZKE123456", plates: "PO 54321", brand: "Volkswagen", model: "Passat", year: 2019, mileage: 112000, clientName: "Piotr Kowalczyk" },
        { id: "216", companyName: "Audi Select Plus", ownerName: "Katarzyna Zielińska", address: "Gdańsk, ul. Długa 15", scheduledDate: null, vin: "WAUZZZ8V5MA123456", plates: "GD 11111", brand: "Audi", model: "A4", year: 2021, mileage: 38000, clientName: "Katarzyna Zielińska" }
    ]
    const deal = all.find(d => d.id === dealId)
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
