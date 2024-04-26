parity <- function(number) {
  list(parity = if (as.integer(number) %% 2 == 0) "even" else "odd")
}

library(RHRV)
library(pracma)

HRV_main <- function(ibi_data) {
  hrv.data  = CreateHRVData()
  hrv.data = SetVerbose(hrv.data, TRUE )

  # hrv.data = LoadBeatRR(hrv.data, input_file_name,RecordPath = input_file_path,scale = 0.001)
  # next lines replace LoadBeatRR b/c we have no file here
  # see https://github.com/cran/RHRV/blob/master/R/LoadBeatRR.R
  beats = cumsum(c(0,ibi_data))
  datetimeaux = strptime("1/1/1900 0:0:0", "%d/%m/%Y %H:%M:%S")
  hrv.data$datetime = datetimeaux
  hrv.data$Beat = data.frame(Time = beats * 0.001) # 0.001 b/c our ibi values are in ms and RHRV uses seconds

  hrv.data = BuildNIHR(hrv.data)
  hrv.data = FilterNIHR(hrv.data)
  hrv.data = InterpolateNIHR(hrv.data, freqhr = 4)
  hrv.data = CreateFreqAnalysis(hrv.data)
  hrv.data=CalculatePSD(hrv.data,1,"lomb",doPlot = F)
  
  #put freq and spec to x and y, respectively
  x <- hrv.data[["FreqAnalysis"]][[1]][["periodogram"]][["freq"]]
  y <- hrv.data[["FreqAnalysis"]][[1]][["periodogram"]][["spec"]]
  #make a subset1 of x and y where x is between 0.059 and 0.069
  xy <- data.frame(x,y)
  peaklist <- findpeaks(xy$y)
  
  #peakXY should be the subset of index is peaklist[,2]
  peakXY <- xy[peaklist[,2],]
  
  #make a subset1 of peaklist where the first column is between 0.059 and 0.069
  subset1 <- subset(peakXY, peakXY$x >= 0.059 & peakXY$x <= 0.069)
  #find a largest 2nd column value in the subset1
  slowerY <- max(subset1[,2])
  #if the slowerY == -Inf, slowerX is NA, else, find a first column value of slowerY
  if(slowerY == -Inf){
    slowerY <- 'n/a'
    slowerX <- 'n/a'
  }else{
    slowerX <- subset1[which(subset1[,2] == slowerY),1]
  }
  #make a subset2 of x and y where x is between 0.075 and 0.093
  subset2 <- subset(peakXY, peakXY$x >= 0.075 & peakXY$x <= 0.093)
  #find a largest 2nd column value in the subset2
  slowY <- max(subset2[,2])
  
  #if the slowY == -Inf, slowX is NA, else, find a first column value of slowY
  if(slowY == -Inf){
    slowY <- 'n/a'
    slowX <- 'n/a'
  }else{
    slowX <- subset2[which(subset2[,2] == slowY),1]
  }
  #make a data frame with column:slowerX,slowerY,slowX,slowY
  peak_info <- data.frame(slowerX,slowerY,slowX,slowY)
  return(peak_info)
}

