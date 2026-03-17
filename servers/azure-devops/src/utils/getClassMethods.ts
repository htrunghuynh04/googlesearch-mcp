function getClassMethods (classPrototype: object): string[] {
  const propertyNames = Object.getOwnPropertyNames(classPrototype);
  return propertyNames.filter(propertyName => propertyName !== 'constructor');
}

export default getClassMethods;