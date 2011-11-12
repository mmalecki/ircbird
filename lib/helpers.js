exports.unique = function(list, property) {
  var result = []
  var obj = {}
  list.forEach(function(element) {
    if (!obj.hasOwnProperty(element[property])) {
      result.push(element)
      obj[element[property]] = true
    }
  })
  return result
}

exports.filterObj = function(obj, filterFun) {
  var result = {}
  Object.keys(obj).forEach(function(key) {
    if (filterFun(key, obj[key]))
      result[key] = obj[key]
  })
  return result
}

exports.objValues = function(obj) {
  var result = []
  Object.keys(obj).forEach(function(key) {
    result.push(obj[key])
  })
  return result
}
