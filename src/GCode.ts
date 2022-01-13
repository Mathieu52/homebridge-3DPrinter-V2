export const getFirmwareByName = (name: string) => {
  switch(name.toLowerCase()) {
    case 'marlin': {
      return Marlin;
    }
    case 'klipper': {
      return Klipper;
    }
    case 'prusa': {
      return Prusa;
    }
    case 'repetier': {
      return Repetier;
    }
    case 'reprap': {
      return RepRap;
    }
    case 'smoothieware': {
      return Smoothieware;
    }
  }
};

export const Marlin = {
  TemperatureAutoReport : (delay: number) => {
    return `M155 S${delay}`;
  },
  TemperatureReport : 'M105',
  SetExtruderTemperature : (temperature: number) => {
    return `M104 S${temperature}`;
  },
  SetBedTemperature : (temperature: number) => {
    return `M140 S${temperature}`;
  },
  SetFanSpeed : (speed: number) => {
    return `M106 S${speed}`;
  },
  TurnFanOff : 'M107',
  EmergencyStop : 'M112',
};

export const Klipper = {
  TemperatureReport : 'M105',
  SetExtruderTemperature : (temperature: number) => {
    return `M104 S${temperature}`;
  },
  SetBedTemperature : (temperature: number) => {
    return `M140 S${temperature}`;
  },
  SetFanSpeed : (speed: number) => {
    return `M106 S${speed}`;
  },
  TurnFanOff : 'M107',
  EmergencyStop : 'M112',
};

export const Prusa = {
  TemperatureReport : 'M105',
  SetExtruderTemperature : (temperature: number) => {
    return `M104 S${temperature}`;
  },
  SetBedTemperature : (temperature: number) => {
    return `M140 S${temperature}`;
  },
  SetFanSpeed : (speed: number) => {
    return `M106 S${speed}`;
  },
  TurnFanOff : 'M107',
  EmergencyStop : 'M112',
};

export const RepRap = {
  TemperatureAutoReport : (delay: number) => {
    return `M155 S${delay}`;
  },
  TemperatureReport : 'M105',
  SetExtruderTemperature : (temperature: number) => {
    return `M104 S${temperature}`;
  },
  SetBedTemperature : (temperature: number) => {
    return `M140 S${temperature}`;
  },
  SetFanSpeed : (speed: number) => {
    return `M106 S${speed}`;
  },
  TurnFanOff : 'M107',
  EmergencyStop : 'M112',
};


export const Repetier = RepRap;

export const Smoothieware = RepRap;