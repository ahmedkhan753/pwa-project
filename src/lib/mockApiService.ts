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
    
    const scheduled = MOCK_DEALS.filter(d => d.status === 'scheduled' || d.status === 'in_progress')
    const unscheduled = MOCK_DEALS.filter(d => d.status === 'new' || d.status === 'unscheduled')
    
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
    
    // For demo purposes, if it's ORDER-001, we ensure all fields are mapped for fetchFullDeal
    if (dealId === "ORDER-001") {
      return {
        ...deal,
        company_name: deal.companyName,
        client_name: `${deal.clientFirstName} ${deal.clientLastName}`,
        inspection_place: deal.location,
        inspection_date: deal.scheduledDate,
        vin: deal.vin,
        registration_number: deal.registrationNumber,
        vehicle_brand: deal.brand,
        vehicle_model: deal.model,
        production_year: deal.year,
        vehicle_color: deal.color,
        mileage: deal.mileage,
        fuel_type: deal.fuelType,
        body_type: deal.bodyType,
        gearbox_type: deal.gearboxType,
        drive_type: deal.driveType,
        first_registration_date: deal.firstRegistrationDate,
        inspector_name: deal.inspectorName
      }
    }
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
        "Alfa Romeo", "Audi", "BMW", "Chevrolet", "Citroën", "Dacia", "Fiat", "Ford", 
        "Honda", "Hyundai", "Jeep", "Kia", "Lexus", "Mazda", "Mercedes-Benz", 
        "Mitsubishi", "Nissan", "Opel", "Peugeot", "Porsche", "Renault", "Seat", 
        "Skoda", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo", "Inne"
      ],
      vehicle_models: {
        "BMW": ["X1","X2","X3","X5","X6","X7","Seria 1","Seria 2","Seria 3","Seria 4","Seria 5","Seria 7","M3","M5"],
        "Toyota": ["Corolla","Camry","RAV4","Yaris","C-HR","Highlander","Land Cruiser","Prius","Aygo","Hilux"],
        "Volkswagen": ["Golf","Passat","Tiguan","Polo","T-Roc","T-Cross","Touareg","Arteon","ID.3","ID.4"],
        "Audi": ["A1","A3","A4","A5","A6","A7","A8","Q2","Q3","Q5","Q7","Q8","TT","R8","e-tron"],
        "Mercedes-Benz": ["A-Class","B-Class","C-Class","E-Class","S-Class","CLA","CLS","GLA","GLB","GLC","GLE","GLS","AMG GT"],
        "Ford": ["Fiesta","Focus","Mondeo","Kuga","Puma","Explorer","Mustang","Transit"],
        "Opel": ["Corsa","Astra","Insignia","Mokka","Grandland","Crossland","Zafira"],
        "Skoda": ["Fabia","Scala","Octavia","Superb","Kamiq","Karoq","Kodiaq","Enyaq"],
        "Hyundai": ["i20","i30","i40","Tucson","Santa Fe","Kona","IONIQ","Nexo"],
        "Kia": ["Picanto","Rio","Ceed","Sportage","Sorento","Stinger","EV6","Niro"],
        "Renault": ["Clio","Megane","Kadjar","Koleos","Captur","Zoe","Talisman"],
        "Peugeot": ["208","308","508","2008","3008","5008","e-208","e-2008"],
        "Fiat": ["500","Panda","Tipo","500X","500L","Ducato","Doblo"],
        "Volvo": ["V40","V60","V90","S60","S90","XC40","XC60","XC90","C40"],
        "Inne": ["Inny"]
      },
      fuel_types: [
        "BENZYNA", "DIESEL", "LPG", "HYBRYDA", "ELEKTRYCZNY", 
        "HYBRYDA PLUG-IN", "HYBRYDA DIESEL", "WODÓR", "NIE DOTYCZY"
      ],
      body_types: [
        "HATCHBACK", "SEDAN", "KOMBI", "SUV", "COUPE", "CABRIO", 
        "VAN/MINIVAN", "PICKUP", "CROSSOVER"
      ],
      gearbox_types: [
        "MANUALNA", "AUTOMATYCZNA", "CVT", "DSG/DCT (DWUSPRZĘGŁOWA)"
      ],
      drive_types: [
        "4x2 (FWD)", "4x2 (RWD)", "4x4 (AWD)", "4x4 (4WD)"
      ],
      seats_options: ["2","4","5","6","7","8","9+"],
      doors_options: ["2","3","4","5"],
      colors: [
        "Biały", "Czarny", "Szary", "Srebrny", "Czerwony", "Niebieski", 
        "Zielony", "Żółty", "Pomarańczowy", "Brązowy", "Bordowy", 
        "Beżowy", "Złoty", "Inny"
      ],
      tire_brands: [
        "Bridgestone", "Continental", "Dunlop", "Falken", "Firestone", 
        "Goodyear", "Hankook", "Kleber", "Kumho", "Michelin", "Nexen", 
        "Nokian", "Pirelli", "Uniroyal", "Vredestein", "Yokohama", 
        "Toyo", "Maxxis", "BFGoodrich", "Inne"
      ]
    }
  }
}
