dependencies {
    api(project(":attendance:attendance-api"))
    implementation(project(":platform:platform-impl"))
    implementation(project(":students:students-impl"))
    
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security")
    
    implementation("org.mapstruct:mapstruct:${rootProject.extra["mapstructVersion"]}")
    annotationProcessor("org.mapstruct:mapstruct-processor:${rootProject.extra["mapstructVersion"]}")
    
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
